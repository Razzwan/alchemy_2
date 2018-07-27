// tslint:disable:no-var-requires
// tslint:disable:no-console

// Hack to be able to find all our modules with relative paths
process.env.NODE_PATH = __dirname;
require('module').Module._initPaths();

import * as Arc from "@daostack/arc.js";
import * as aws from 'aws-sdk';
import promisify = require("es6-promisify");
import * as moment from "moment";
import { denormalize, normalize } from "normalizr";
import * as Redis from 'redis';
import * as Redux from 'redux';
import loggerMiddleware from "redux-logger";
import thunkMiddleware from "redux-thunk";

import HDWalletProvider from "./lib/truffle-hdwallet-provider";

// haven’t figured out how to get web3 typings to properly expose the Web3 constructor.
// v1.0 may improve on this entire Web3 typings experience
const Web3 = require("web3");

import * as arcActions from "./actions/arcActions";
import * as arcConstants from "constants/arcConstants";
import { default as arcReducer, initialState as arcInitialState, checkProposalExpired, IArcState, IDaoState, IProposalState, ProposalStates, TransactionStates, IVoteState } from "./reducers/arcReducer";
import * as selectors from "selectors/daoSelectors";
import web3Reducer, { IWeb3State } from "./reducers/web3Reducer";

import * as ActionTypes from "constants/arcConstants";
import * as schemas from "./schemas";
import Util from "./lib/util";

require('dotenv').config();

const redisClient = Redis.createClient(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const redisGet = promisify(redisClient.get.bind(redisClient));
const redisSet = promisify(redisClient.set.bind(redisClient));

const arcjsNetwork = process.env.arcjs_network;

if (process.env.NODE_ENV == 'production') {
  // Use Infura on production
  const infuraNetwork = arcjsNetwork == 'live' ? 'mainnet' : arcjsNetwork;

  // The default account in reading from Infura, I'm not totally sure why this is needed (but it is), or what account it should be
  const mnemonic = process.env.DEFAULT_ACCOUNT_MNEMONIC;
  const infuraKey = process.env.INFURA_KEY;
  const provider = new HDWalletProvider(mnemonic, "https://" + infuraNetwork + ".infura.io/" + infuraKey);

  // Setup web3 ourselves so we can use Infura instead of letting Arc.js setup web3
  global.web3 = new Web3(provider.engine);

  process.env.API_URL = process.env.API_URL || "https://daostack-alchemy.herokuapp.com";
} else {
  process.env.API_URL = process.env.API_URL || "http://127.0.0.1:3001";
}

aws.config.region = 'us-west-2';
const s3 = new aws.S3();
const s3FileName = 'initialArcState-' + arcjsNetwork + '.json';
const s3FileType = 'application/json';

// Use redux store for the state
interface IRootState {
  arc: IArcState;
  web3: IWeb3State;
}

const reducers = {
  arc: arcReducer,
  web3: web3Reducer,
};

let initialState: IRootState;
let store = Redux.createStore(
  Redux.combineReducers(reducers),
  Redux.applyMiddleware(thunkMiddleware)
);

// Subscribe to the redux store changes
const unsubscribe = store.subscribe(() => {
  // XXX: dont need to do anything here
});

process.on('SIGTERM', () => {
  console.log("Got SIGTERM so exiting process");
  unsubscribe();
  process.exit(0);
});

async function updateCache() {
  await Arc.InitializeArcJs();

  const startTime = moment();

  // Block number to start looking fromn:
  //   first look argument passed in to script, otherwise get last block cached from redis, otherwise we start over from block 0
  let lastCachedBlock = process.argv[2] || (await redisGet('alchemy-last-block-' + arcjsNetwork)) || 0;

  // Latest block to cache up to
  const latestBlock = await Util.getLatestBlock();

  if (lastCachedBlock == 0) {
    console.log("Starting to cache the "  + arcjsNetwork + " blockchain from the beginning");
    await store.dispatch(arcActions.getDAOs(0, latestBlock));
  } else {
    console.log("Pulling current cached state for " + arcjsNetwork + " from S3 bucket " + process.env.S3_BUCKET);
    try {
      const s3Get = promisify(s3.getObject.bind(s3));
      const resp = await s3Get({Bucket: process.env.S3_BUCKET || 'daostack-alchemy', Key: s3FileName})
      initialState = JSON.parse(resp.Body.toString('utf-8'));
      await store.dispatch({ type: arcConstants.ARC_LOAD_CACHED_STATE_FULFILLED, payload: initialState });
    } catch (e) {
      console.log("error = ", e);
    }

    console.log("Starting to cache the "  + arcjsNetwork + " blockchain from block ", lastCachedBlock, "to block", latestBlock);

    // Look for new DAOs
    console.log("Looking for new DAOs");
    await store.dispatch(arcActions.getDAOs(lastCachedBlock, latestBlock));

    // TODO: if there is a new DAO then i think we need to wait for it to be loaded completely
    console.log("Done looking for new DAOs, now looking for new proposals");

    // Watch for new, confirmed proposals coming in
    const contributionRewardInstance = await Arc.ContributionRewardFactory.deployed();
    const proposalEventWatcher = contributionRewardInstance.NewContributionProposal({ }, { fromBlock: lastCachedBlock, toBlock: latestBlock });
    const getProposalEvents = promisify(proposalEventWatcher.get.bind(proposalEventWatcher));
    const proposalEvents: Array<Arc.DecodedLogEntryEvent<Arc.NewContributionProposalEventResult>> = await getProposalEvents();
    for (let index = 0; index < proposalEvents.length; index++) {
      const event = proposalEvents[index];
      console.log("Got new proposal", event.args);
      await store.dispatch(arcActions.onProposalCreateEvent(event.args));
    }

    console.log("Done looking for new proposals, now looking for new stakes");

    // TODO: look for allEvents on the voting machine instance to process these in the exact order they happened
    const votingMachineInstance = await Arc.GenesisProtocolFactory.deployed();

    const stakeEventWatcher = votingMachineInstance.Stake({ }, { fromBlock: lastCachedBlock, toBlock: latestBlock });
    const getStakeEvents = promisify(stakeEventWatcher.get.bind(stakeEventWatcher));
    const stakeEvents: Array<Arc.DecodedLogEntryEvent<Arc.StakeEventResult>> = await getStakeEvents();
    for (let index = 0; index < stakeEvents.length; index++) {
      const event = stakeEvents[index];
      console.log("Got new stake", event.args);
      await store.dispatch(arcActions.onStakeEvent(event.args._avatar, event.args._proposalId, event.args._staker, Number(event.args._vote), Util.fromWei(event.args._amount)));
    }

    console.log("Done looking for new stakes, now looking for new votes");

    const voteEventWatcher = votingMachineInstance.VoteProposal({ }, { fromBlock: lastCachedBlock, toBlock: latestBlock });
    const getVoteEvents = promisify(voteEventWatcher.get.bind(voteEventWatcher));
    const voteEvents: Array<Arc.DecodedLogEntryEvent<Arc.VoteProposalEventResult>> = await voteEventWatcher.get();
    for (let index = 0; index < voteEvents.length; index++) {
      const event = voteEvents[index];
      console.log("Got new vote", event.args);
      await store.dispatch(arcActions.onVoteEvent(event.args._avatar, event.args._proposalId, event.args._voter, Number(event.args._vote), Util.fromWei(event.args._reputation)));
    }

    console.log("Done looking for new votes, now looking for executed proposals");

    const executeProposalEventWatcher = votingMachineInstance.ExecutedProposals({}, { fromBlock: lastCachedBlock, toBlock: latestBlock });
    const getExecutedProposalEvents = promisify(executeProposalEventWatcher.get.bind(executeProposalEventWatcher));
    const executedProposalEvents: Arc.ExecutedGenesisProposal[] = await getExecutedProposalEvents();
    for (let index = 0; index < executedProposalEvents.length; index++) {
      const event = executedProposalEvents[index];
      console.log("Proposal executed", event);
      const { avatarAddress, proposalId, decision, totalReputation, executionState } = event;
      await store.dispatch(arcActions.onProposalExecuted(avatarAddress, proposalId, executionState, Number(decision), Util.fromWei(totalReputation)));
    }

    console.log("Done with executed proposals, now updating reputation balances");

    const stakingTokenAddress = await votingMachineInstance.contract.stakingToken();
    const stakingToken = await (await Arc.Utils.requireContract("StandardToken")).at(stakingTokenAddress) as any;

    const state = (store.getState() as IRootState);
    for (const avatarAddress of Object.keys(state.arc.daos)) {
      const dao = denormalize(state.arc.daos[avatarAddress], schemas.daoSchema, state.arc);
      const daoInstance = await Arc.DAO.at(avatarAddress);

      const mintEventWatcher = daoInstance.reputation.Mint({}, { fromBlock: lastCachedBlock, toBlock: latestBlock });
      const getMintEvents = promisify(mintEventWatcher.get.bind(mintEventWatcher));
      const mintEvents = await getMintEvents();
      for (let index = 0; index < mintEvents.length; index++) {
        const event = mintEvents[index];
        console.log("Reputation minted for account", event.args._to, "in DAO", avatarAddress);
        await store.dispatch(arcActions.onReputationChangeEvent(avatarAddress, event.args._to));
      }

      const burnEventWatcher = daoInstance.reputation.Burn({}, { fromBlock: lastCachedBlock, toBlock: latestBlock });
      const getBurnEvents = promisify(burnEventWatcher.get.bind(burnEventWatcher));
      const burnEvents = await getBurnEvents();
      for (let index = 0; index < burnEvents.length; index++) {
        const event = burnEvents[index];
        console.log("Reputation burned from account", event.args._from, "in DAO", avatarAddress);
        await store.dispatch(arcActions.onReputationChangeEvent(avatarAddress, event.args._from));
      }

      console.log("Done updating reputation, now update DAO ETH and GEN balances");

      const newEthBalance = Util.fromWei(await promisify(global.web3.eth.getBalance)(avatarAddress));
      await store.dispatch(arcActions.onDAOEthBalanceChanged(avatarAddress, newEthBalance));
      const newGenBalance = Util.fromWei(await stakingToken.balanceOf(avatarAddress));
      await store.dispatch(arcActions.onDAOGenBalanceChanged(avatarAddress, newGenBalance));

      console.log("Done updating balances, now look for any expired proposals");

      // Check all open proposals to see if any expired and if so update state and gather redemptions
      let proposals = dao.proposals;
      proposals = proposals.filter((proposal: IProposalState) => (
        proposal.state === ProposalStates.PreBoosted ||
        proposal.state === ProposalStates.Boosted ||
        proposal.state === ProposalStates.QuietEndingPeriod
      ));
      for (const proposal of proposals) {
        if (checkProposalExpired(proposal) != proposal.state) {
          console.log("Proposal expired", proposal.proposalId, proposal.title);
          await store.dispatch(arcActions.onProposalExpired(proposal));
        }
      }
    }
  }

  const arcState = (store.getState() as IRootState).arc;
  if (arcState.daosLoaded) {
    // Write cached blockchain data to S3
    console.log("Writing state to S3");

    const s3Params = {
      Body: JSON.stringify(arcState),
      Bucket: process.env.S3_BUCKET || 'daostack-alchemy',
      Key: s3FileName,
      //Expires: 60,
      ContentType: s3FileType,
      ACL: 'public-read'
    };

    const s3Put = promisify(s3.putObject.bind(s3));
    try {
      const data = await s3Put(s3Params);
      console.log("Successfully wrote cached data for " + arcjsNetwork + " to S3. ", data);
    } catch (e) {
      console.error("Error writing data to S3: ", e, e.stack);
    }

    console.log("Updating last block read on redis: ", latestBlock);
    await redisSet('alchemy-last-block-' + arcjsNetwork, latestBlock);

    const endTime = moment();
    const duration = moment.duration(endTime.diff(startTime));
    const minutes = duration.asMinutes();
    console.log("Finishing updating cache after " + minutes + " minutes");
  } else {
    console.log("Something weird happened, DAOs not loaded so didn't write the data");
  }
}

export default updateCache;