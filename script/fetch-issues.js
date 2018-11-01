const fs = require('fs');
const moment = require('moment');
const { DEPLOY_PREVIEW: isDeployPreview } = require('netlify-env');
import GraphQLClient from '../src/github-graphql';

// GITHUB API Token is a must to use GraphQL API
const token = process.env.GITHUB_TOKEN;

const getTime = timeString => moment(timeString).toDate().getTime();

// earliest date we want to query from
// GitHub supports reactions since 2016-03-10
let earliestDate = process.env.EARLIEST_DATE || '2017-01-01T00:00:00Z';

if (isDeployPreview) {
  const earliestDateForPr = process.env.EARLIEST_DATE_PR ||
    moment().subtract(3, 'months').format('YYYY-MM-DDThh:mm:ssZ');
  earliestDate = earliestDateForPr;
}

console.log('The earliest date has been set to', earliestDate);

// review will be ignored if it's written by any author specified here
// delimiter: space
const ignoreAuthor = process.env.IGNORE_REVIEW_AUTHOR ||
  'gitmate-bot rultor TravisBuddy';

// review will be ignored if it matches any string specified here
// it can be a literal or a regular expression
// delimiter: space
const ignoreContent = process.env.IGNORE_REVIEW_CONTENT ||
  '@gitmate-bot @rultor ^(unack|ack)';

// Need to instantiate a new object every time, since it doesn't
// support concurrency
const getClient = () => {
  return new GraphQLClient(token, ignoreAuthor, ignoreContent);
};

const repo = process.env.REPOSITORIES;

if (!repo) {
  console.log('No repositories to cache. Skipping.');
  process.exit();
}

const repoOwner = repo.split(':')[0];
const repoNames = repo.substring(repo.indexOf(':') + 1).split('|');

console.log('Fetching data for', repoOwner, repoNames);

async function fetchIssues(owner, names) {
  let result = [];
  const config = {earliestDate};
  for (const name of names) {
    try {
      const fetchedResult = await getClient().repo(owner, name).issues(config).fetchAll();
      if (fetchedResult) result = result.concat(fetchedResult);
    } catch (error) {
      console.log('fetch issue failed, repo owner:', owner,
        'repo name:', name, 'error:', error);
    }
  }
  return result;
}

async function fetchPullRequests(owner, names) {
  let result = [];
  const config = {earliestDate};
  for (const name of names) {
    try {
      const fetchedResult = await getClient().repo(owner, name).pullRequests(config).fetchAll();
      if (fetchedResult) result = result.concat(fetchedResult);
    } catch (error) {
      console.log('fetch pull request failed, repo owner:', owner,
        'repo name:', name, 'error:', error);
    }
  }
  return result;
}

async function fetchLabels(owner, names) {
  const result = [];
  for (const name of names) {
    try {
      const fetchedResult = await getClient().repo(owner, name).labels().fetchOne();
      if (fetchedResult) result.push(fetchedResult);
    } catch (error) {
      console.log('fetch label failed, repo owner:', owner,
        'repo name:', name, 'error:', error);
    }
  }
  return result;
}

function generateRepoInfo(owner, names, issues) {
  let result = [], map = {};
  for (const issue of issues) {
    const updatedAt = issue.issue.updatedAt;
    const repoName = issue.repoName;
    if (repoName in map) {
      if (getTime(updatedAt) > getTime(map[repoName])) {
        map[repoName] = updatedAt;
      }
    } else {
      map[repoName] = updatedAt;
    }
  }
  for (const name of names) {
    result.push({
      repoOwner: owner,
      repoName: name,
      isPrivate: false,
      lastSeenAt: map[name]
    });
  }
  return result;
}

function filterRecent(issues) {
  // only keep issues created/updated in the past month
  const today = new Date();
  const dayLastMonth = getTime(today.setMonth(today.getMonth() - 1));
  return issues.filter(issue => dayLastMonth < issue.updatedAtMs);
}

;(async () => {
  let issueInfo = [], prInfo = [], labelInfo = [];
  if (token) {
    try {
      [issueInfo, labelInfo, prInfo] = await Promise.all([
        fetchIssues(repoOwner, repoNames),
        fetchLabels(repoOwner, repoNames),
        fetchPullRequests(repoOwner, repoNames)
      ]);
    } catch (error) {
      console.log(error);
    };
  } else {
    console.log('warning: no GitHub token available, skip pre-fetching.');
  }

  const issues = issueInfo.concat(prInfo);
  const repositories = generateRepoInfo(repoOwner, repoNames, issues);
  const result = {
    issues,
    repoLabels: labelInfo,
    repositories
  };
  const recentResult = {
    issues: filterRecent(issues),
    repoLabels: labelInfo,
    repositories
  };

  fs.writeFile(`${__dirname}/../issues.json`, JSON.stringify(result), err => {
    if (err) console.log(err);
  });

  fs.writeFile(
    `${__dirname}/../recent-issues.json`,
    JSON.stringify(recentResult),
    err => {
      if (err) console.log(err);
    }
  );

})();
