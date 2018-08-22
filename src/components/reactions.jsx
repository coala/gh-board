import {Component} from 'react';
import * as BS from 'react-bootstrap';

import Client from '../github-client';

class Reactions extends Component {
  constructor(props) {
    super(props);
    this.state = {
      canAdd: {},
      // use cache to reflect reaction count on frontend
      // if we fetch up-to-date reaction count after mutation,
      // we have to refetch the whole pull request which wastes
      // a lot of API hits (there is no way to fetch single review
      // comment at the moment)
      cacheCount: {
        THUMBS_UP: 0,
        THUMBS_DOWN: 0,
        LAUGH: 0,
        HOORAY: 0,
        CONFUSED: 0,
        HEART: 0
      }
    };
  }

  onClick = async (id, content) => {
    const canAdd = this.state.canAdd[content];
    const saveToDatabase = this.props.saveCallBack;
    let result, msg;
    if (canAdd) {
      ({ result, msg } = await Client.getGraphQLClient().addReaction(
        {id, content}
      ));
    } else {
      ({ result, msg } = await Client.getGraphQLClient().removeReaction(
        {id, content}
      ));
    }
    if (result) {
      if (canAdd) {
        // reaction creation succeeds

        // Note that if it is already meta-reviewed by the user but not via gh-board,
        // action (add reaction) will fail, but GitHub won't return any error/warning.
        // The good news is that user won't be annoyed because the frontend behavior
        // is they add reactions successfully.

        // A side note is that gh-board will not update accordingly if user does
        // meta-review directly on GitHub web page instead of on gh-board. This is
        // because the `updatedBy` attribute of the pull request won't get changed
        // due to meta-review.

        this.setState((prevState) => {
          let newState = prevState;
          newState.canAdd[content] = false;
          // update cache
          newState.cacheCount[content] += 1;
          return newState;
        });

        saveToDatabase(content, true);
      } else {
        // reaction removal succeeds
        this.setState((prevState) => {
          let newState = prevState;
          newState.canAdd[content] = true;
          // update cache
          newState.cacheCount[content] -= 1;
          return newState;
        });

        saveToDatabase(content, false);
      }
    } else {
      if (canAdd) {
        // reaction creation fails
        console.log('add', content, 'to comment id', id, 'failed.',
          'message: ', msg);
      } else {
        console.log('remove', content, 'from comment id', id, 'failed',
          'message:', msg);
        // reaction removal fails
        if (msg && msg.length && msg[0].type === 'FORBIDDEN') {
          console.log('reaction removal failed due to permission error.',
            'This is probably because user has done meta-review somewhere out',
            'of gh-board.');
          this.setState((prevState) => {
            let newState = prevState;
            newState.canAdd[content] = true;
            // clean cache
            newState.cacheCount[content] = 0;
            return newState;
          });
          this.syncReview();
        }
      }
    }
  }

  render() {
    // id is the global identifier for the corresponding review comment
    const {id, stat, hasLogin, noReactionByMe} = this.props;

    if (noReactionByMe && !Object.keys(this.state.canAdd).length) {
      // use deep copy for canAdd instead of reference so that we can
      // we deliberately only copy them once
      this.state.canAdd = {
        THUMBS_UP: noReactionByMe.THUMBS_UP,
        THUMBS_DOWN: noReactionByMe.THUMBS_DOWN,
        LAUGH: noReactionByMe.LAUGH,
        HOORAY: noReactionByMe.HOORAY,
        CONFUSED: noReactionByMe.CONFUSED,
        HEART: noReactionByMe.HEART
      };
    }

    // props reflect real status of reactions, but may be out of date
    // we need to update cached information (this.state) accordingly
    if (noReactionByMe && this.state.canAdd) {
      const contents = ['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART'];
      for (const content of contents) {
        if (!noReactionByMe[content] && !this.state.canAdd[content]
          && this.state.cacheCount[content] === 1) {
          // our action (reaction creation) is now correctly reflected by props
          // need to flush cache, otherwise reaction count would be wrong
          console.log('flush creation cache of content', content);
          this.state.cacheCount[content] = 0;
        }
        if (noReactionByMe[content] && this.state.canAdd[content]
          && this.state.cacheCount[content] === -1) {
          // our action (reaction removal) is now correctly reflected by props
          // need to flush cache, otherwise reaction count would be wrong
          console.log('flush removal cache of content', content);
          this.state.cacheCount[content] = 0;
        }
      }
    }

    // use null when count is zero because we don't want to display
    // number zero on frontend
    const reactions = [
      {
        emoji: '👍',
        count: stat.THUMBS_UP + this.state.cacheCount.THUMBS_UP || null,
        name: 'THUMBS_UP'
      },
      {
        emoji: '👎',
        count: stat.THUMBS_DOWN + this.state.cacheCount.THUMBS_DOWN || null,
        name: 'THUMBS_DOWN'
      },
      {
        emoji: '😄',
        count: stat.LAUGH + this.state.cacheCount.LAUGH || null,
        name: 'LAUGH'
      },
      {
        emoji: '🎉',
        count: stat.HOORAY + this.state.cacheCount.HOORAY || null,
        name: 'HOORAY'
      },
      {
        emoji: '😕',
        count: stat.CONFUSED + this.state.cacheCount.CONFUSED || null,
        name: 'CONFUSED'
      },
      {
        emoji: '❤️',
        count: stat.HEART + this.state.cacheCount.HEART || null,
        name: 'HEART'
      }
    ];
    return reactions.map(reaction => (
        <BS.Button
          key={reaction.name}
          bsClass="reaction-btn"
          onClick={() => this.onClick(id, reaction.name)}
          disabled={!hasLogin}>
          {reaction.emoji} {reaction.count}
        </BS.Button>
    ));
  }
}

export default Reactions;
