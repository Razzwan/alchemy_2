import { Address, IDAOState, Member, IMemberState } from "@daostack/arc.js";
import { getArc } from "arc";
import { getProfile } from "actions/profilesActions";
import AccountImage from "components/Account/AccountImage";
import AccountProfileName from "components/Account/AccountProfileName";
import Reputation from "components/Account/Reputation";
import FollowButton from "components/Shared/FollowButton";
import withSubscription, { ISubscriptionProps } from "components/Shared/withSubscription";
import CopyToClipboard, { IconColor } from "components/Shared/CopyToClipboard";
import * as React from "react";
import { connect } from "react-redux";
import { from } from "rxjs";
import { first } from "rxjs/operators";
import { IRootState } from "reducers";
import { IProfileState } from "reducers/profilesReducer";

import BN = require("bn.js");

import * as css from "./Account.scss";


interface IExternalProps {
  accountAddress: Address;
  daoState: IDAOState;
  width?: number;
}

interface IStateProps {
  currentAccountProfile: IProfileState;
  profile: IProfileState;
}

const mapStateToProps = (state: IRootState, ownProps: IExternalProps & ISubscriptionProps<IMemberState>): IExternalProps & IStateProps & ISubscriptionProps<IMemberState | null> => {
  const account = ownProps.data;

  return {
    ...ownProps,
    currentAccountProfile: state.profiles[state.web3.currentAccountAddress],
    profile: account ? state.profiles[account.address] : null,
  };
};

interface IDispatchProps {
  getProfile: typeof getProfile;
}

const mapDispatchToProps = {
  getProfile,
};

type IProps = IExternalProps & IStateProps & IDispatchProps & ISubscriptionProps<IMemberState>;

class AccountPopup extends React.Component<IProps, null> {

  public async componentDidMount() {
    const { profile, getProfile, accountAddress } = this.props;

    if (!profile) {
      getProfile(accountAddress);
    }
  }

  public render(): RenderOutput {
    const accountInfo = this.props.data;
    const { accountAddress, daoState, profile, width } = this.props;
    const reputation = accountInfo ? accountInfo.reputation : new BN(0);

    const _width = width || 12;

    return (
      <div className={css.targetAccount} style={{ width: _width }}>
        <div className={css.avatar}>
          <AccountImage accountAddress={accountAddress} profile={profile} width={_width} />
        </div>
        <div className={css.accountInfo}>
          <div className={css.name}><AccountProfileName accountAddress={accountAddress} accountProfile={profile} daoAvatarAddress={daoState.id} /></div>
          <div>
            {!profile || Object.keys(profile.socialURLs).length === 0 ? "No social profiles" :
              <span>
                {profile.socialURLs.twitter ?
                  <a href={"https://twitter.com/" + profile.socialURLs.twitter.username} className={css.socialButton} target="_blank" rel="noopener noreferrer">
                    <img src='/assets/images/Icon/social/twitter.svg' className={css.icon} />
                  </a> : ""}
                {profile.socialURLs.github ?
                  <a href={"https://github.com/" + profile.socialURLs.github.username} className={css.socialButton} target="_blank" rel="noopener noreferrer">
                    <img src='/assets/images/Icon/social/github.svg' className={css.icon} />
                  </a> : ""}
              </span>
            }
          </div>
          <div className={css.beneficiaryAddress}>
            <div className={css.accountAddress}>{accountAddress}</div>
            <CopyToClipboard value={accountAddress} color={IconColor.Black}/>
          </div>

          <div>
            <FollowButton type="users" id={this.props.accountAddress} />
          </div>

          <div className={css.holdings}>
            <span>HOLDINGS</span>
            <div><Reputation daoName={daoState.name} totalReputation={daoState.reputationTotalSupply} reputation={reputation} /></div>
          </div>
        </div>
      </div>
    );
  }
}

const ConnectedAccountPopup = connect(mapStateToProps, mapDispatchToProps)(AccountPopup);

// TODO: move this subscription to ProposalData.
//  Can't do that right now because need to get the proposal state first to get the proposer and beneficiary
//  before we can load the member data for those addresses
const SubscribedAccountPopup = withSubscription({
  wrappedComponent: ConnectedAccountPopup,
  loadingComponent: <div>Loading...</div>,
  errorComponent: (props) => <div>{props.error.message}</div>,

  checkForUpdate: (oldProps: IProps, newProps: IProps) => { return oldProps.accountAddress !== newProps.accountAddress || oldProps.daoState.id !== newProps.daoState.id; },

  createObservable: (props: IProps) => {
    return from(
      Member.search(
        getArc(),
        { where: {
          address: props.accountAddress,
          dao: props.daoState.id,
        } },
      ).pipe(first()).toPromise()
        .then(members => {
          if (members.length > 0) {
            return members[0].fetchState();
          } else {
            return Promise.resolve(null);
          }
        })
    );
  },
});

export default SubscribedAccountPopup;
