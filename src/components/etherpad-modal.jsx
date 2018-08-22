import {Component} from 'react';
import * as BS from 'react-bootstrap';

class EtherpadModal extends Component {
  static displayName = 'Etherpad';
  onSave = () => {
    let serverURLVal = this._serverURL.value;
    if (serverURLVal) {
      serverURLVal = serverURLVal.trim();
    }
    this.setURLSettings(serverURLVal);
    let apikey = this._apikey.value;
    if (apikey) {
      apikey = apikey.trim();
    }
    this.setAPIkey(apikey);
    this.onCancel();
  }
  onClear = () => {
    this.setURLSettings(null);
    this.setAPIkey(null);
    this.setState({});
  }
  onCancel = () => {
    this.props.onHide();
  }
  getSettings = () => {
    return {
      serverURL: window.localStorage.getItem('ep-url'),
      apikey: window.localStorage.getItem('ep-apikey')
    };
  }
  setURLSettings = (url) => {
    if (url) {
      window.localStorage.setItem('ep-url', url);
    } else {
      window.localStorage.removeItem('ep-url');
    }
  }
  setAPIkey = (key) => {
    if (key) {
      window.localStorage.setItem('ep-apikey', key);
    } else {
      window.localStorage.removeItem('ep-apikey');
    }
  }
  render() {
    const {serverURL, apikey} = this.getSettings();

    const footer = (
      <span>
        <BS.Button bsStyle='primary' onClick={this.onSave}>Save</BS.Button>
        <BS.Button bsStyle='default' onClick={this.onClear}>Clear</BS.Button>
        <BS.Button bsStyle='default' onClick={this.onCancel}>Cancel</BS.Button>
      </span>
    );

    return (
      <BS.Modal {...this.props}>
        <BS.Modal.Header closeButton>
          <BS.Modal.Title>Etherpad server settings</BS.Modal.Title>
        </BS.Modal.Header>
        <BS.ModalBody>
        <div className='github-token-instructions'>
          <h4>"Etherpad-lite Server URL"</h4>
          <p>
            If you need collaborative editing for issues, set an Etherpad-lite server's URL:<br/>
            <BS.FormControl
              type='text'
              defaultValue={serverURL}
              disabled={!!serverURL}
              placeholder='Enter Etherpad server URL (e.g. http://server.etherpad.com:8080)'
              inputRef={r => this._serverURL = r}
            />
          </p>
          <p>
            And also set the server's API key:<br/>
            <BS.FormControl
              type='text'
              defaultValue={apikey}
              disabled={!!apikey}
              placeholder='Enter Etherpad API key'
              inputRef={r => this._apikey = r}
            />
          </p>
        </div>
        </BS.ModalBody>
        <BS.Modal.Footer className='modal-footer'>
          {footer}
        </BS.Modal.Footer>
      </BS.Modal>
    );
  }
}

export default EtherpadModal;
