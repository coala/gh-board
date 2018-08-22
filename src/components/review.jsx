import {Component} from 'react';
import * as BS from 'react-bootstrap';
import classnames from 'classnames';
import {Link} from 'react-router';

import {getFilters} from '../route-utils';
import IssueStore from '../issue-store';
import Database from '../database';

import GithubFlavoredMarkdown from './gfm';
import Time from './time';
import ReviewBlurb from './review-blurb';
import IssueOrPullRequestBlurb from './issue-blurb';
import Reactions from './reactions';
import withAuth from './login-auth';

class ReviewCard extends Component {
  saveToDatabase = (content, isAdd) => {
    // reviewCard is just part of issueCard
    const {card, loginInfo} = this.props;
    const {repoOwner, repoName, number} = card;
    const {login} = loginInfo;
    if (isAdd) {
      // add a new reaction
      if (!card.reactions) card.reactions = [];
      card.reactions.push({
        content,
        user: {
          login,
        },
      });
    } else {
      // remove an existing reaction
      card.reactions = card.reactions.filter((reaction) => {
        return !(reaction.user.login === login && reaction.content === content);
      });
    }
    // find the corresponding issueCard
    const issueCard = IssueStore.issueNumberToCard(repoOwner, repoName, number);
    // update corresponding issueCard
    issueCard.issue.pullRequest.comments.forEach(reviewCard => {
      if (reviewCard.id === card.id) {
        reviewCard = card;
      }
    });
    Database.putCards([issueCard]);
  }

  render() {
    const {card, primaryRepoName, loginInfo} = this.props;
    const {repoOwner, repoName, number, id, bodyText, reactions, url} = card;
    const key = `${repoOwner}/${repoName}#${number}-${id}`;

    // comment updatedAt is updated when comment content is edited.
    // Note that the default `updatedAt` field of review comment
    // provided by GraphQL API is inaccurate. Thus, we use our custom
    // updatedAt, defined by `lastEditedAt` and `createdAt` time if never edited.
    const updatedAt = card.updatedAt;

    const user = card.author;
    const assignedAvatar = (
      <Link to={getFilters().toggleUserName(user.login).url()}>
        <img
          key='avatar'
          className='avatar-image'
          title={'Click to filter on ' + user.login}
          src={user.avatarUrl}/>
      </Link>
    );
    // stop highlighting after 5min
    const isUpdated = Date.now() - Date.parse(updatedAt) < 2 * 60 * 1000;

    // put the corresponding pull request as related card
    const issueCard = IssueStore.issueNumberToCard(repoOwner, repoName, number);
    const relatedCards = [issueCard].map((issueCard) => {
      let title;
      if (issueCard.issue) {
        title = (
          <span className='related-issue-title'>{issueCard.issue.title}</span>
        );
      }
      return (
        <div key={issueCard.key()} className='related-issue'>
          <IssueOrPullRequestBlurb
            card={issueCard}
            primaryRepoName={card.repoName}/>
          {title}
        </div>
      );
    });

    const classes = {
      'review': true,
      'is-updated': isUpdated,
    };

    const header = [
      <ReviewBlurb key='review-blurb'
        card={card}
        primaryRepoName={primaryRepoName} />,
    ];

    let reactionsStat = {
      THUMBS_UP: 0,
      THUMBS_DOWN: 0,
      LAUGH: 0,
      HOORAY: 0,
      HEART: 0,
      CONFUSED: 0
    };
    if (reactions) {
      reactions.forEach(reaction => reactionsStat[reaction.content]++);
    }

    let noReactionByMe;
    let hasLogin = false;
    if (loginInfo) {
      hasLogin = true;
      noReactionByMe = {
        THUMBS_UP: true,
        THUMBS_DOWN: true,
        LAUGH: true,
        HOORAY: true,
        HEART: true,
        CONFUSED: true
      };
      if (reactions) {
        reactions.forEach(reaction => {
          if (reaction.user && reaction.user.login === loginInfo.login) {
            noReactionByMe[reaction.content] = false;
          }
        });
      }
    }

    return (
      <div className='-card-and-related'>
        <BS.ListGroupItem
          key={key}
          header={header}
          className={classnames(classes)}>

          <span className='-extra-span-for-inline-popover'>
            <a
              key='link'
              className='review-title'
              target='_blank'
              href={url}>
                <GithubFlavoredMarkdown
                  inline
                  repoOwner={repoOwner}
                  repoName={repoName}
                  text={bodyText}/>
            </a>
          </span>

          <span key='footer' className='review-footer'>
            <span key='left-footer' className='comment-reactions'>
              <Reactions
                id={id}
                stat={reactionsStat}
                noReactionByMe={noReactionByMe}
                hasLogin={hasLogin}
                saveCallBack={this.saveToDatabase}/>
            </span>
            <span key='right-footer' className='review-time-and-user'>
              <Time key='time' className='updated-at' dateTime={updatedAt}/>
              {assignedAvatar}
            </span>
          </span>
        </BS.ListGroupItem>
        <div key='related' className='related-issues'>
          {relatedCards}
        </div>
      </div>
    );
  }
}

function Review({review, loginInfo}) {
  return (
    <ReviewCard card={review} loginInfo={loginInfo}/>
  );
}

export default withAuth(Review);
