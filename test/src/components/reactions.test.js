import renderer from 'react-test-renderer';
import Reactions from '../../../src/components/reactions';

jest.mock('../../../src/github-client', () => ({
  getGraphQLClient: jest.fn(() => {}),
}));

it('does not display number zero', () => {
  const stat = {
    THUMBS_UP: 0,
    THUMBS_DOWN: 0,
    LAUGH: 0,
    HOORAY: 0,
    CONFUSED: 0,
    HEART: 0,
  };
  const rendered = renderer.create(
    <Reactions stat={stat} />
  );
  expect(rendered.toJSON()).toMatchSnapshot();
});
