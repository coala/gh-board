import {Component} from 'react';

import CurrentUserStore from '../user-store';
import Client from '../github-client';

function withAuth(WrappedComponent) {
  return class extends Component {
    state = {loginInfo: null};

    componentDidMount() {
      Client.on('changeToken', this.onChangeToken);
      this.onChangeToken();
    }

    componentWillUnmount() {
      Client.off('changeToken', this.onChangeToken);
    }

    onChangeToken = () => {
      CurrentUserStore.fetchUser()
      .then((loginInfo) => {
        this.setState({loginInfo});
      }).catch(() => {
        this.setState({loginInfo: null});
      });
    };

    render() {
      return <WrappedComponent {...this.props} loginInfo={this.state.loginInfo} />;
    }
  };
}

export default withAuth;
