import { History } from "history";
import { Address, DAO, IDAOState, IProposalStage, IPluginState, AnyProposal, Vote, Reward, Stake, Proposal, Plugin, Proposals } from "@daostack/arc.js";
import { getArc } from "arc";
import Loading from "components/Shared/Loading";
import withSubscription, { ISubscriptionProps } from "components/Shared/withSubscription";
import gql from "graphql-tag";
import Analytics from "lib/analytics";
import { pluginName } from "lib/pluginUtils";
import { Page } from "pages";
import * as React from "react";
import { BreadcrumbsItem } from "react-breadcrumbs-dynamic";
import InfiniteScroll from "react-infinite-scroll-component";
import { Link } from "react-router-dom";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { Observable, combineLatest } from "rxjs";
import { connect } from "react-redux";
import { showNotification } from "reducers/notifications";
import TrainingTooltip from "components/Shared/TrainingTooltip";
import ProposalCard from "../Proposal/ProposalCard";
import * as css from "./PluginProposals.scss";
import i18next from "i18next";
import { GRAPH_POLL_INTERVAL } from "../../settings";

// For infinite scrolling
const PAGE_SIZE_QUEUED = 100;
const PAGE_SIZE_PREBOOSTED = 100;

const Fade = ({ children, ...props }: any): any => (
  <CSSTransition
    {...props}
    timeout={1000}
    classNames={{
      enter: css.fadeEnter,
      enterActive: css.fadeEnterActive,
      exit: css.fadeExit,
      exitActive: css.fadeExitActive,
    }}
  >
    {children}
  </CSSTransition>
);

interface IExternalProps {
  currentAccountAddress: Address;
  history: History;
  pluginState: IPluginState;
  daoState: IDAOState;
  crxRewarderProps: any;
}

interface IDispatchProps {
  showNotification: typeof showNotification;
}

type SubscriptionData = [AnyProposal[], AnyProposal[]];
type IProps = IExternalProps & IDispatchProps & ISubscriptionProps<SubscriptionData>;

type PreboostedProposalsSubscriptionData = AnyProposal[];
type IPropsPreBoosted = {
  currentAccountAddress: Address;
  pluginState: IPluginState;
  daoState: IDAOState;
} & ISubscriptionProps<AnyProposal[]>;

type RegularProposalsSubscriptionData = AnyProposal[];
type IPropsQueued = {
  currentAccountAddress: Address;
  pluginState: IPluginState;
  daoState: IDAOState;
} & ISubscriptionProps<AnyProposal[]>;


const mapDispatchToProps = {
  showNotification,
};

class PluginProposalsPreboosted extends React.Component<IPropsPreBoosted, null> {

  public render(): RenderOutput {
    const proposalsPreBoosted = this.props.data;
    const { currentAccountAddress, daoState, fetchMore, pluginState } = this.props;
    let proposalCount = 0;

    const preBoostedProposalsHTML = (
      <TransitionGroup className="boosted-proposals-list">
        {proposalsPreBoosted.map((proposal: AnyProposal): any => (
          <Fade key={"proposal_" + proposal.id}>
            <ProposalCard proposal={proposal as any} daoState={daoState} currentAccountAddress={currentAccountAddress} suppressTrainingTooltips={proposalCount++ > 0} />
          </Fade>
        ))}
      </TransitionGroup>
    );

    return (
      <div className={css.regularContainer}>
        <div className={css.proposalsHeader}>
          <TrainingTooltip placement="bottom" overlay={i18next.t("Pending Proposal Tooltip")}>
            <span>Pending Boosting Proposals ({pluginState.numberOfPreBoostedProposals})</span>
          </TrainingTooltip>
          {proposalsPreBoosted.length === 0 && <div><img src="/assets/images/yoga.svg" /></div>}
        </div>
        <div className={css.proposalsContainer}>
          {
            /**
             * scrollThreshold 0% forces getting all of the preboosted proposals
             * pretty much right away (but paged)
             */
          }
          <InfiniteScroll
            style={{ overflow: "visible" }}
            dataLength={proposalsPreBoosted.length}
            next={fetchMore}
            hasMore={proposalsPreBoosted.length < pluginState.numberOfPreBoostedProposals}
            loader={<h4>Fetching more preboosted proposals...</h4>}
            endMessage={""}
            scrollThreshold="0%"
          >
            {preBoostedProposalsHTML}
          </InfiniteScroll>
        </div>
      </div>
    );
  }
}

const SubscribedProposalsPreBoosted = withSubscription<IPropsPreBoosted, PreboostedProposalsSubscriptionData>({
  wrappedComponent: PluginProposalsPreboosted,
  loadingComponent: <Loading />,
  errorComponent: null,

  checkForUpdate: (oldProps, newProps) => {
    return oldProps.pluginState.id !== newProps.pluginState.id;
  },

  createObservable: async (props: IPropsPreBoosted) => {
    const dao = new DAO(getArc(), props.daoState.id);
    const pluginId = props.pluginState.id;

    // the list of preboosted proposals
    return dao.proposals({
      where: { scheme: pluginId, stage: IProposalStage.PreBoosted },
      orderBy: "preBoostedAt",
      first: PAGE_SIZE_PREBOOSTED,
      skip: 0,
    }, { polling: true, pollInterval: GRAPH_POLL_INTERVAL });
  },

  getFetchMoreObservable: (props: IPropsPreBoosted, data: PreboostedProposalsSubscriptionData) => {
    const dao = new DAO(getArc(), props.daoState.id);
    const pluginId = props.pluginState.id;

    return dao.proposals({
      where: { scheme: pluginId, stage: IProposalStage.PreBoosted },
      orderBy: "preBoostedAt",
      first: PAGE_SIZE_PREBOOSTED,
      skip: data.length,
    }, { polling: true, pollInterval: GRAPH_POLL_INTERVAL });
  },
});

class PluginProposalsQueued extends React.Component<IPropsQueued, null> {

  public render(): RenderOutput {
    const proposalsQueued = this.props.data;
    const { currentAccountAddress, daoState, fetchMore, pluginState } = this.props;
    let proposalCount = 0;

    const queuedProposalsHTML = (
      <TransitionGroup className="queued-proposals-list">
        {proposalsQueued.map((proposal: AnyProposal): any => (
          <Fade key={"proposal_" + proposal.id}>
            <ProposalCard proposal={proposal as any} daoState={daoState} currentAccountAddress={currentAccountAddress} suppressTrainingTooltips={proposalCount++ > 0} />
          </Fade>
        ))}
      </TransitionGroup>
    );

    return (
      <div className={css.regularContainer}>
        <div className={css.proposalsHeader}>
          <TrainingTooltip placement="bottom" overlay={i18next.t("Regular Proposal Tooltip")}>
            <span>Regular Proposals ({pluginState.numberOfQueuedProposals})</span>
          </TrainingTooltip>
          {proposalsQueued.length === 0 && <div><img src="/assets/images/yoga.svg" /></div>}
        </div>
        <div className={css.proposalsContainer}>
          <InfiniteScroll
            style={{ overflow: "visible" }}
            dataLength={proposalsQueued.length} //This is important field to render the next data
            next={fetchMore}
            hasMore={proposalsQueued.length < pluginState.numberOfQueuedProposals}
            loader={<h4>Fetching more queued proposals...</h4>}
            endMessage={""}
          >
            {queuedProposalsHTML}
          </InfiniteScroll>
        </div>
      </div>
    );
  }
}

const SubscribedProposalsQueued = withSubscription<IPropsQueued, RegularProposalsSubscriptionData>({
  wrappedComponent: PluginProposalsQueued,
  loadingComponent: <Loading />,
  errorComponent: null,

  checkForUpdate: (oldProps, newProps) => {
    return oldProps.pluginState.id !== newProps.pluginState.id;
  },

  createObservable: async (props: IPropsQueued) => {
    const dao = new DAO(getArc(), props.daoState.id);
    const pluginId = props.pluginState.id;

    // the list of queued proposals
    return dao.proposals({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { scheme: pluginId, stage: IProposalStage.Queued },
      orderBy: "confidence",
      orderDirection: "desc",
      first: PAGE_SIZE_QUEUED,
      skip: 0,
    }, { polling: true, pollInterval: GRAPH_POLL_INTERVAL });
  },

  getFetchMoreObservable: (props: IPropsQueued, data: RegularProposalsSubscriptionData) => {
    const dao = new DAO(getArc(), props.daoState.id);
    const pluginId = props.pluginState.id;

    return dao.proposals({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { scheme: pluginId, stage: IProposalStage.Queued },
      orderBy: "confidence",
      orderDirection: "desc",
      first: PAGE_SIZE_QUEUED,
      skip: data.length,
    }, { polling: true, pollInterval: GRAPH_POLL_INTERVAL });
  },
});

class PluginProposalsPage extends React.Component<IProps, null> {

  public componentDidMount() {
    Analytics.track("Page View", {
      "Page Name": Page.PluginProposals,
      "DAO Address": this.props.daoState.address,
      "DAO Name": this.props.daoState.name,
      "Scheme Address": this.props.pluginState.address,
      "Scheme Name": this.props.pluginState.name,
    });
  }

  public render(): RenderOutput {
    const { data } = this.props;

    const [proposalsBoosted, allProposals] = data;
    const { currentAccountAddress, daoState, pluginState } = this.props;
    let proposalCount = 0;

    const boostedProposalsHTML = (
      <TransitionGroup className="boosted-proposals-list">
        {proposalsBoosted.map((proposal: AnyProposal): any => (
          <Fade key={"proposal_" + proposal.id}>
            <ProposalCard proposal={proposal as any} daoState={daoState} currentAccountAddress={currentAccountAddress} suppressTrainingTooltips={proposalCount++ > 0} />
          </Fade>
        ))}
      </TransitionGroup>
    );

    const pluginFriendlyName = pluginName(pluginState, pluginState.address);

    return (
      <>
        <BreadcrumbsItem to={`/dao/${daoState.address}/plugins`}>Proposal Plugins</BreadcrumbsItem>
        <BreadcrumbsItem to={`/dao/${daoState.address}/plugin/${pluginState.id}`}>{pluginFriendlyName}</BreadcrumbsItem>

        {(allProposals.length === 0)
          ?
          <div className={css.noDecisions}>
            <img className={css.relax} src="/assets/images/yogaman.svg" />
            <div className={css.proposalsHeader}>
              No upcoming proposals
            </div>
            <p>You can be the first one to create a {pluginFriendlyName} proposal today! :)</p>
            <div className={css.cta}>
              <Link to={"/dao/" + daoState.address}>
                <img className={css.relax} src="/assets/images/lt.svg" /> Back to plugins
              </Link>
            </div>
          </div>
          :
          <div>
            <div className={css.boostedContainer}>
              <div className={css.proposalsHeader}>
                <TrainingTooltip placement="bottom" overlay={i18next.t("Boosted Proposal Tooltip")}>
                  <span>Boosted Proposals ({pluginState.numberOfBoostedProposals})</span>
                </TrainingTooltip>
                {proposalsBoosted.length === 0 && <div><img src="/assets/images/yoga.svg" /></div>}
              </div>
              <div className={css.proposalsContainer + " " + css.boostedProposalsContainer}>
                {boostedProposalsHTML}
              </div>
            </div>

            <SubscribedProposalsPreBoosted currentAccountAddress={currentAccountAddress} daoState={daoState} pluginState={pluginState}></SubscribedProposalsPreBoosted>

            <SubscribedProposalsQueued currentAccountAddress={currentAccountAddress} daoState={daoState} pluginState={pluginState}></SubscribedProposalsQueued>

          </div>
        }
      </>
    );
  }
}

// For some reason there is a weird maybe bug in TypeScript where adding the functions for fetchingMOre
//   is causing it to misinterpret the type of the SubscriptionData, so have to manually specificy here
const SubscribedPluginProposalsPage = withSubscription<IProps, SubscriptionData>({
  wrappedComponent: PluginProposalsPage,
  loadingComponent: <Loading />,
  errorComponent: null,

  checkForUpdate: (oldProps, newProps) => {
    return oldProps.pluginState.id !== newProps.pluginState.id;
  },

  createObservable: async (props: IExternalProps) => {
    const arc = getArc();
    const dao = new DAO(arc, props.daoState.id);
    const pluginId = props.pluginState.id;

    // this query will fetch al data we need before rendering the page, so we avoid hitting the server
    // NOTE: We cannot use the fragment to reduce the boilerplate here because
    // we're using nested where filters for votes, stakes, and gpRewards. These fields are already
    // present in the fragment. See here for a solution: https://github.com/daostack/arc.js/issues/471
    let bigProposalQuery;
    if (props.currentAccountAddress) {
      bigProposalQuery = gql`
        query ProposalDataForPluginProposalsPage {
          proposals (where: {
            scheme: "${pluginId}"
            stage_in: [
              "${IProposalStage[IProposalStage.Boosted]}",
              "${IProposalStage[IProposalStage.PreBoosted]}",
              "${IProposalStage[IProposalStage.Queued]}"
              "${IProposalStage[IProposalStage.QuietEndingPeriod]}",
            ]
          }){
            id
            accountsWithUnclaimedRewards
            boostedAt
            closingAt
            confidenceThreshold
            createdAt
            dao {
              id
              schemes {
                id
                address
              }
            }
            description
            descriptionHash
            executedAt
            executionState
            expiresInQueueAt
            genesisProtocolParams {
              id
              activationTime
              boostedVotePeriodLimit
              daoBountyConst
              limitExponentValue
              minimumDaoBounty
              preBoostedVotePeriodLimit
              proposingRepReward
              queuedVotePeriodLimit
              queuedVoteRequiredPercentage
              quietEndingPeriod
              thresholdConst
              votersReputationLossRatio
            }
            scheme {
              ...PluginFields
            }
            gpQueue {
              id
              threshold
              votingMachine
            }
            organizationId
            preBoostedAt
            proposer
            quietEndingPeriodBeganAt
            stage
            stakesFor
            stakesAgainst
            tags {
              id
            }
            totalRepWhenCreated
            totalRepWhenExecuted
            title
            url
            votesAgainst
            votesFor
            votingMachine
            winningOutcome
            votes (where: { voter: "${props.currentAccountAddress}"}) {
              ...VoteFields
            }
            stakes (where: { staker: "${props.currentAccountAddress}"}) {
              ...StakeFields
            }
            gpRewards (where: { beneficiary: "${props.currentAccountAddress}"}) {
              ...RewardFields
            }
            ${Object.values(Proposals)
    .filter((proposal) => proposal.fragment)
    .map((proposal) => "..." + proposal.fragment?.name)
    .join("\n")}
          }
        }
        ${Object.values(Proposals)
    .filter((proposal) => proposal.fragment)
    .map((proposal) => proposal.fragment?.fragment.loc?.source.body)
    .join("\n")}
        ${Vote.fragments.VoteFields}
        ${Stake.fragments.StakeFields}
        ${Reward.fragments.RewardFields}
        ${Plugin.baseFragment}
      `;
    } else {
      bigProposalQuery = gql`
        query ProposalDataForSchemeProposalsPage {
          proposals (where: {
            scheme: "${pluginId}"
            stage_in: [
              "${IProposalStage[IProposalStage.Boosted]}",
              "${IProposalStage[IProposalStage.PreBoosted]}",
              "${IProposalStage[IProposalStage.Queued]}"
              "${IProposalStage[IProposalStage.QuietEndingPeriod]}",
            ]
          }){
            ...ProposalFields
          }
        }
        ${Proposal.baseFragment}
        ${Plugin.baseFragment}
      `;
    }

    return combineLatest(
      // the list of boosted proposals
      dao.proposals({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        where: { scheme: pluginId, stage_in: [IProposalStage.Boosted, IProposalStage.QuietEndingPeriod] },
        orderBy: "boostedAt",
      }, { polling: true, pollInterval: GRAPH_POLL_INTERVAL }),
      // big subscription query to make all other subscription queries obsolete
      arc.getObservable(bigProposalQuery, { polling: true, pollInterval: GRAPH_POLL_INTERVAL }) as Observable<AnyProposal[]>,
    );
  },
});

export default connect(null, mapDispatchToProps)(SubscribedPluginProposalsPage);
