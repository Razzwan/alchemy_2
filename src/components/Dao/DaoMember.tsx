import BN = require("bn.js");
import { IDAOState, IMemberState, Member } from "@daostack/arc.js";
import AccountImage from "components/Account/AccountImage";
import AccountProfileName from "components/Account/AccountProfileName";
import Reputation from "components/Account/Reputation";
import withSubscription, { ISubscriptionProps } from "components/Shared/withSubscription";
import { fromWeiToString, ethErrorHandler } from "lib/util";
import * as React from "react";
import { Link } from "react-router-dom";
import { IProfileState } from "reducers/profilesReducer";
import * as css from "./Dao.scss";

interface IProps extends ISubscriptionProps<IMemberState> {
  daoState: IDAOState;
  member: Member;
  daoTotalReputation: BN;
  profile: IProfileState;
}

class DaoMember extends React.Component<IProps, null> {

  private openSocial = (url: string) => (e: any) => {
    e.preventDefault();
    window.open(url, "_blank");
  }

  public render(): RenderOutput {
    const { daoState, daoTotalReputation, profile } = this.props;
    const memberState = this.props.data;

    return (
      <div className={css.member + " clearfix"}
        key={"member_" + memberState.address}
        data-test-id={"member_" + memberState.address}>
        <Link to={"/profile/" + memberState.address + (daoState ? "?daoAvatarAddress=" + daoState.address : "")}>
          <table className={css.memberTable}>
            <tbody>
              <tr>
                <td className={css.memberAvatar}>
                  <AccountImage
                    accountAddress={memberState.address}
                    profile={profile}
                    width={40}
                  />
                </td>
                <td className={css.memberName}>
                  { profile ?
                    <div>
                      <AccountProfileName accountAddress={memberState.address} accountProfile={profile} daoAvatarAddress={daoState.address} />
                      <br/>
                    </div>
                    : <div className={css.noProfile}>No Profile</div>
                  }
                </td>
                <td className={css.memberAddress}>
                  {memberState.address}
                </td>
                <td className={css.memberReputation}>
                  <span className={css.reputationAmount}>{fromWeiToString(memberState.reputation)}</span>
                  <div className={css.reputationAmounts}>
                    (<Reputation daoName={daoState.name} totalReputation={daoTotalReputation} reputation={memberState.reputation}/>)
                  </div>
                </td>
                <td className={css.memberSocial}>
                  {profile && Object.keys(profile.socialURLs).length > 0 ?
                    <span>
                      { profile.socialURLs.twitter ?
                        <span onClick={this.openSocial("https://twitter.com/" + profile.socialURLs.twitter.username)} className={css.socialButton}>
                          <img src='/assets/images/Icon/social/twitter.svg' className={css.icon} />
                        </span> : ""}
                      { profile.socialURLs.github ?
                        <span onClick={this.openSocial("https://github.com/" + profile.socialURLs.github.username)} className={css.socialButton}>
                          <img src='/assets/images/Icon/social/github.svg' className={css.icon} />
                        </span> : ""}
                    </span>
                    : ""
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </Link>
      </div>
    );
  }
}

export default withSubscription({
  wrappedComponent: DaoMember,
  loadingComponent: <div>Loading...</div>,
  errorComponent: (props) => <div>{ props.error.message }</div>,
  checkForUpdate: (oldProps, newProps) => { return oldProps.member.id !== newProps.member.id; },
  createObservable: (props: IProps) => props.member.state().pipe(ethErrorHandler()),
});
