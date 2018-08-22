import * as BS from 'react-bootstrap';
import Database from '../database';
import Loadable from './loadable';

function ReviewBlurb({card: {url}}) {
  return (
    <span className='review-blurb'>
      <a className='blurb-number-link'
        target='_blank'
        href={url}
        >
        <BS.Button bsClass="review-btn">
          View Discussion
        </BS.Button>
      </a>
    </span>
  );
}

function ReviewBlurbShell({card, primaryRepoName, context}) {
  const {repoOwner, repoName} = card;
  const promise = Database.getRepoOrNull(repoOwner, repoName);

  return (
    <Loadable
      promise={promise}
      renderLoaded={(repo) => (<ReviewBlurb repo={repo} card={card} primaryRepoName={primaryRepoName} context={context} />)}
    />
  );
}

export default ReviewBlurbShell;
