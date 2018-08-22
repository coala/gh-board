import createReactClass from 'create-react-class';
import * as BS from 'react-bootstrap';
import EtherpadClient from 'etherpad-lite-client';
import {Link} from 'react-router';

import history from '../history';
import IssueStore from '../issue-store';
import UserStore from '../user-store';
import {getFilters} from '../route-utils';

import Loadable from './loadable';
import GithubFlavoredMarkdown from './gfm';

const EtherpadInner = createReactClass({
  getDefaultProps() {
    return {
      hostName: window.localStorage.getItem('ep-url'),
      secret: window.localStorage.getItem('ep-apikey')
    };
  },
  getInitialState() {
    return {isSaving: false, text: 'Please wait. If you see this message for long time, please check "Etherpad Server Settings".'};
  },
  componentDidMount() {
    this.poll();
  },
  componentWillUnmount() {
    clearTimeout(this.__timeout); // stop polling for the new markdown to generate the preview
  },
  poll() {
    // Start polling
    const etherpad = EtherpadClient.connect(
      this.getEtherpadInfo()
    );
    etherpad.getText({padID: this.props.padName}, (error, data) => {
      if (error) {
        console.error('Error creating pad: ' + error.message);
        if (error.message === 'padID does not exist') {
          this.loadIssueBody().then(() => {
            this.poll(); // Should be guaranteed to no longer be "This is an empty pad"
          });
        }
      } else {
        this.setState({text:data.text});
        if (data.text.indexOf('Welcome to Etherpad!') >= 0) {
          this.loadIssueBody().then(() => {
            this.poll(); // Should be guaranteed to no longer be "This is an empty pad"
          });
        } else {
          this.__timeout = setTimeout(this.poll, 2000);
        }
      }
    });
  },
  getPadName() {
    const {repoOwner, repoName, number} = this.props;
    return `github.com_${repoOwner}_${repoName}_${number}`;
  },
  getUrl() {
    const {hostName, padName} = this.props;
    // from https://github.com/ether/etherpad-lite-jquery-plugin/blob/master/js/etherpad.js
    return `${hostName}/p/${padName}`;
  },
  getEtherpadInfo() {
    const reg = /^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*):([0-9]+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/;
    let m = window.localStorage.getItem('ep-url').match(reg);
    if (m) {
      return {
        apikey: window.localStorage.getItem('ep-apikey'),
        host: m[2],
        port: parseInt(m[3]),
        ssl: m[1] === 'https' ? true : false
      };
    } else {
      // TODO:Error handling
    }
  },
  loadIssueBody() {
    const {loadBody} = this.props;

    return loadBody().then((text) => {
      const etherpad = EtherpadClient.connect(
        this.getEtherpadInfo()
      );
      etherpad.setText({padID: this.props.padName, text: text}, (err) => {
        /* eslint-disable no-console */
        console.log('Because of CORS this returns an error but actually succeeeds');
        console.log(err);
        /* eslint-enable no-console */
      });
      return text; // just in case someone uses this promise

    });
  },
  saveIssueBody() {
    const {text} = this.state;
    const {saveBody} = this.props;
    this.setState({isSaving: true});
    saveBody(text).then(() => {
      // TODO: un-disable the state
      this.setState({isSaving: false});
    })
    .catch((err) => {
      alert('There was an error saving.\n' + JSON.stringify(err));
    });
  },
  promptLoadIssueBody() {
    if (confirm('Are you sure you want to discard the current collaborative edits and replace it with what is currently in GitHub?')) {
      this.loadIssueBody();
    }
  },
  render() {
    const {title, repoOwner, repoName, getBody} = this.props;
    const {text, isSaving} = this.state;
    const src = this.getUrl();
    let goBack;
    if (window.history.length) {
      goBack = (
        <BS.Button onClick={() => history.goBack()}>Go Back</BS.Button>
      );
    }
    if (getFilters().getState().repoInfos.length > 0) {
      goBack = (
        <Link to={getFilters().setRouteName('').url()} className='btn btn-default'>Go Back</Link>
      );
    }
    let isLoadEnabled = false;
    let isSaveEnabled = false;
    if (text.trim() !== getBody().trim()) {
      isLoadEnabled = true;
      // Only if the text changed and the user is authenticated should we allow saving
      if (UserStore.getUser()) {
        isSaveEnabled = !isSaving;
      }
    }
    return (
      <div>
        <div className='etherpad-operations'>
          {goBack}
          <BS.Button disabled={!isLoadEnabled} onClick={this.promptLoadIssueBody} title='Discards Edits and replaces the editor with what is currently on GitHub'>Reset Editor</BS.Button>
          <BS.Button disabled={!isSaveEnabled} onClick={this.saveIssueBody} title='Save changed made here back to GitHub (you must be logged in to gh-board)'>Save to GitHub</BS.Button>
          {title}
        </div>
        <div className='etherpad-wrapper col-xs-12'>
          <iframe className='etherpad-frame col-xs-6' src={src} />
          <div className='etherpad-preview col-xs-6'>
            <GithubFlavoredMarkdown text={text} repoOwner={repoOwner} repoName={repoName} />
          </div>
        </div>
      </div>
    );
  }
});

const Etherpad = createReactClass({
  renderLoaded() {
    const {title, padName, getBody, saveBody, loadBody, repoOwner, repoName} = this.props;
    return (
      <EtherpadInner title={title} padName={padName} getBody={getBody} saveBody={saveBody} loadBody={loadBody} repoOwner={repoOwner} repoName={repoName}/>
    );
  },
  render() {
    let promise = IssueStore.loadCardsFromDatabase();
    if (this.props.promise) {
      promise = promise.then(() => { return this.props.promise; });
    }
    return (
      <div>
        <Loadable promise={promise}
          renderLoaded={this.renderLoaded}
        />
      </div>
    );
  }
});

export default Etherpad;
