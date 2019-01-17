import {Component} from 'react';
import {SyncIcon} from 'react-octicons';
import * as BS from 'react-bootstrap';

const STATUS = {
  INITIAL: 'initial',
  RESOLVED: 'resolved',
  ERROR: 'error'
};

class Loadable extends Component {
  static defaultProps = {
    renderError: (err, show, close) => {
      console.error(err);
      // If it is a permissions error then it might be a rate limit
      if (err.name === 'InvalidStateError') {
        return (
          <span>It looks like your browser is in private browsing mode. gh-board uses IndexedDB to cache requests to GitHub. Please disable Private Browsing to see it work.</span>
        );
      } else {
        let message;
        if(err.status === 403)
          message = "It looks like either you do not have permission to see this repository or the rate limit for requests to GitHub has been exceeded. This usually happens when you are not logged in to gh-board. Try signing in to continue.";
        else
          message = "Problem loading. Is it a valid repo? And have you exceeded your number of requests? Usually happens when not logged in because GitHub limits anonymous use of their API.";
        return (
          <BS.Modal show={show}>
            <BS.Modal.Header>
            </BS.Modal.Header>
            <BS.Modal.Body >
              <div>
                <p>
                  {message}
                </p>
                <code>
                  {JSON.parse(err.message).message}
                  <br />
                  <a href={JSON.parse(err.message).documentation_url}>Documentation URL</a>
                </code>
                <br />
                <br />
                <BS.Button onClick={close}>OK</BS.Button>
              </div>
            </BS.Modal.Body>
          </BS.Modal>
        );
      }
    }
  };

  state = {status: STATUS.INITIAL, value: null, show: false};

  componentDidMount() {
    const {promise} = this.props;
    promise.then(this.onResolve, this.onError);
  }

  componentDidUpdate(prevProps) {
    if (this.props.promise !== prevProps.promise) {
      const {promise} = this.props;
      promise.then(this.onResolve, this.onError);
    }
  }

  onResolve = (value) => {
    // TODO: Find out why this is being called multiple times
    this.setState({status: STATUS.RESOLVED, value: value});
  };

  onError = (value) => {
    // TODO: Find out why this is being called multiple times
    if (this.state.status !== STATUS.ERROR) {
      this.setState({status: STATUS.ERROR, value: value, show: true});
    }
  };

  renderLoading = () => {
    const {loadingText} = this.props;
    return (
      <span className='loadable is-loading'>
        <SyncIcon className='icon-spin'/>
        {' ' + (loadingText || 'Loading...')}
      </span>
    );
  };

  close = () => {
    this.setState({show: false});
  }

  render() {
    const {status, value} = this.state;
    let {renderLoading, renderLoaded, renderError} = this.props;

    renderLoading = renderLoading || this.renderLoading;

    if (status === STATUS.INITIAL) {
      return renderLoading();
    } else if (status === STATUS.RESOLVED) {
      return renderLoaded(value);
    } else {
      return renderError(value, this.state.show, this.close);
    }
  }
}

export default Loadable;
