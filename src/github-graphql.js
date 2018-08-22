import moment from 'moment';
import GraphQL from 'graphql-client';

import {
  GITHUB_ISSUE_INFO_QUERY,
  GITHUB_PR_INFO_QUERY,
  GITHUB_LABEL_INFO_QUERY,
  GITHUB_REACTION_INFO_QUERY,
  GITHUB_REACTION_ADD_MUTATION,
  GITHUB_REACTION_REMOVE_MUTATION,
} from '../script/queries';

const DEBUG = process.env.NODE_ENV === 'development';

// global event id
let EVENT_ID = 0;

function getTime(timeString) {
  // parse timezone-aware time in string format to number
  // e.g. '2017-01-01T00:00:00Z' becomes 1483228800000
  // null means the earliest date
  if (timeString) {
    return moment(timeString).toDate().getTime();
  } else {
    return 0;
  }
}

function sleep(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

// A wrapper for GraphQL client that supports chainable methods.
// Concurrency is NOT supported.
// sample usages:
// 1. fetchAllIssues = await Client.getGraphQLClient()
//      .repo(repoOwner, repoName)
//      .issues({sort: 'UPDATED_AT'}).
//      .fetchAll({per_page: 100});
// 2. fetchAllReactions = await Client.getGraphQLClient()
//      .repo(repoOwner, repoName)
//      .reactions({pr_number, per_review: 20})
//      .fetchOne({per_page: 100});

class GraphQLClient {
  constructor(token, ignoreAuthor, ignoreContent, emitter = () => null, sleepTime = 3, warningThreshold = 15) {
    this.token = token;
    this.GH_GQL_BASE = 'https://api.github.com/graphql';
    this.GH_GQL_OPTIONS = {
      url: this.GH_GQL_BASE,
      headers: token
        ? { Authorization: `bearer ${token}` }
        : {},
    };
    this.client = GraphQL(this.GH_GQL_OPTIONS);

    // used to emit rate limit change 
    this.emitter = emitter;

    // sleep time (sec) before timeout retry
    this.sleepTime = sleepTime;

    // maximum number of warnings before stop fetching
    this.warningThreshold = warningThreshold;

    // review will be ignored if it matches any string specified here
    // it can be a literal or a regular expression
    // delimiter: space
    this.ignoreAuthor = ignoreAuthor || '';

    // review will be ignored if it's written by any author specified here
    // delimiter: space
    this.ignoreContent = ignoreContent || '';
  }

  _updateRateLimit(rateLimit) {
    this.remaining = rateLimit.remaining;
    this.limit = rateLimit.limit;
    this.resetAt = rateLimit.resetAt;
    const emitterRate = {
      remaining: this.remaining,
      limit: this.limit,
      reset: this.resetAt,
    };
    // to match octokat.js style
    const responseStatus = 200;
    // config = {method, path, data, options}
    const config = null;
    this.emitter('end', EVENT_ID, config, responseStatus, emitterRate);
    EVENT_ID += 1;
  }

  repo(repoOwner, repoName) {
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    if (DEBUG) {
      console.log('repoOwner set:', repoOwner, 'repoName set:', repoName);
    }
    return this;
  }

  // First type of queries: ISSUES
  issues(config) {
    const { sort, direction, earliestDate } = config || {};
    // There are three types of order
    // https://developer.github.com/v4/enum/issueorderfield/
    // COMMENTS, CREATED_AT (default), and UPDATED_AT
    this.orderBy = {
      field: sort || 'CREATED_AT',
      direction: direction || 'ASC',
    };
    this._fetch = this._fetchIssues;
    this.earliestDate = earliestDate;
    return this;
  }

  // Second type of queries: PULLREQUESTS
  pullRequests(config) {
    const { sort, direction, earliestDate } = config || {};
    // order of pull requests and issues follow the same rule
    // see comment within `issues` method
    this.orderBy = {
      field: sort || 'CREATED_AT',
      direction: direction || 'ASC',
    };
    this._fetch = this._fetchPullRequests;
    this.earliestDate = earliestDate;
    return this;
  }

  // Third type of queries: LABELS
  labels() {
    this._fetch = this._fetchLabels;
    return this;
  }

  // Fourth type of queries: REACTIONS
  reactions(config) {
    const {
      pr_number, reviews_count,
      comments_count, discussions_per_review } = config || {};
    this._fetch = this._fetchReactions;
    this.prNumber = pr_number;
    // number of comments to fetch per pull request
    this.reviewsCount = reviews_count || 20;
    // number of discussions to fetch per review
    this.discussionsPerReview = discussions_per_review || 10;
    // number of comments to fetch per pull request
    this.commentsCount = comments_count || 20;
    return this;
  }

  // first type of mutations: add reaction
  // return boolean value indicating result of action
  async addReaction({id, content}) {
    if (DEBUG) {
      console.log('add reaction for id', id, 'with content', content);
    }
    let data, errors;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_REACTION_ADD_MUTATION,
        {id, content}
      ));
    } catch (error) {
      return {result: false, msg: error};
    }
    if (!data || errors) {
      return {result: false, msg: errors};
    }
    return {result: true, msg: data};
  }

  // second type of mutations: remove reaction
  // return boolean value indicating result of action
  async removeReaction({id, content}) {
    if (DEBUG) {
      console.log('remove reaction for id', id, 'with content', content);
    }
    let data, errors;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_REACTION_REMOVE_MUTATION,
        {id, content}
      ));
    } catch (error) {
      return {result: false, msg: error};
    }
    if (!data || errors) {
      return {result: false, msg: errors};
    }
    return {result: true, msg: data};
  }

  async fetchAll(config) {
    const { per_page } = config || {};
    this.perPage = per_page || 100;
    this.cursor = null;
    this.pageCount = 0;
    this.fetchedData = null;
    this.warningCount = 0;

    if (this._fetch === this._fetchLabels
        || this._fetch === this._fetchReactions) {
      console.log('warning: only ISSUES and PULL REQUESTS have `fetchAll` method.',
        'Will call `fetchOne()` instead.');
      return await this.fetchOne(config);
    }

    // fetch data with pagination
    this.pagination = true;
    while (this.pagination) {
      await this._fetch(this.cursor);
    }
    if (DEBUG) {
      console.log('owner:', this.repoOwner, 'name:', this.repoName,
        'pagination:', this.pagination, 'page count:',
        this.pageCount, 'fetching ends.');
    }
    return this.fetchedData;
  }

  async fetchOne(config) {
    const { per_page } = config || {};
    this.perPage = per_page || 100;
    this.cursor = null;
    this.pageCount = 0;
    this.warningCount = 0;
    this.fetchedData = null;
    // fetch data without pagination
    await this._fetch();
    return this.fetchedData;
  }

  async _fetchReactions() {
    const owner = this.repoOwner;
    const name = this.repoName;
    const number = this.prNumber;
    const reviewsCount = this.reviewsCount || this.perPage;
    const commentsCount = this.commentsCount || this.perPage;
    const discussionsPerReview = this.discussionsPerReview;

    if (DEBUG) {
      console.log('\nfetch reactions, owner:', owner, 'name:', name,
        'pull request number', number);
    }

    let data, errors;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_REACTION_INFO_QUERY,
        {owner, name, number, reviewsCount, discussionsPerReview, commentsCount}
      ));
    } catch (error) {
      console.log('fetch reactions of pr failed',
        'owner:', owner, 'name:', name, 'pull request number:', number,
        'reviewsCount:', reviewsCount, 'discussionsPerReview', discussionsPerReview,
        'commentsCount', commentsCount, 'error:', error);
    }

    let rawComments;
    if (data) {
      // update rate limit
      this._updateRateLimit(data.rateLimit);
      // collect review comments
      rawComments = data.repository.pullRequest.reviews.nodes.map(
        node => node.comments.nodes);
      rawComments = [].concat.apply([], rawComments);
      // collect issue comments
      rawComments = rawComments.concat(
        data.repository.pullRequest.comments.nodes);
    } else {
      this.warningCount++;
      console.log('warning: no available reaction data!',
        'owner:', owner, 'name:', name, 'pull request number:', number,
        'error:', errors);
      return await this._handleWarning(this._fetchReactions);
    }
    // reactions are wrapped by corresponding comment
    this.fetchedData = rawComments;
  }

  _fetchLabels = async () => {
    const owner = this.repoOwner;
    const name = this.repoName;

    if (DEBUG) {
      console.log('\nfetch labels, owner:', owner, 'name:', name);
    }

    let data, errors;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_LABEL_INFO_QUERY,
        {owner, name}
      ));
    } catch (error) {
      console.log('fetch labels failed',
        'owner:', owner, 'name:', name, 'error:', error);
    }

    if (data && data.repository) {
      // update rate limit
      this._updateRateLimit(data.rateLimit);

      const result = data.repository.labels.nodes.map(node => ({
        id: node.id,
        name: node.name,
        color: node.color,
        default: node.isDefault,
      }));
      this.fetchedData = {
        repoOwner: owner,
        repoName: name,
        labels: result,
      };
    } else {
      this.warningCount++;
      console.log('warning: no available label data!',
        'owner:', owner, 'name:', name, 'error:', errors);
      return await this._handleWarning(this._fetchLabels);
    }
  }

  _fetchIssues = async () => {
    const owner = this.repoOwner;
    const name = this.repoName;
    const perPage = this._slowStart();
    const cursor = this.cursor;
    const orderBy = this.orderBy;
    const pageCount = this.pageCount;
    const earliestDate = this.earliestDate;

    if (DEBUG) {
      console.log('\nfetch issues, owner:', owner, 'name:', name,
        'cursor:', cursor, 'page count:', pageCount);
    }

    let data, errors, hasPreviousPage = false, reachDateThreshold = false;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_ISSUE_INFO_QUERY,
        {owner, name, perPage, before: cursor, orderBy}
      ));
    } catch (error) {
      console.log('fetch issue fails, owner:', owner, 'name:', name,
        'cursor:', cursor, 'error:', error);
    }
    if (data && data.repository) {
      // update rate limit
      this._updateRateLimit(data.rateLimit);

      this.pageCount++;
      const { nodes, pageInfo } = data.repository.issues;
      this.cursor = pageInfo.startCursor;
      hasPreviousPage = pageInfo.hasPreviousPage;
      const result = nodes.map(node => {
        if (getTime(node.updatedAt) < getTime(earliestDate)) {
          reachDateThreshold = true;
          return null;
        }
        return this._mapNodeToIssue(node);
      }).filter((node) => node);

      // store fetched data within this page
      if (!this.fetchedData) {
        this.fetchedData = [];
      }

      if (result && result.length) {
        // filter out null element
        this.fetchedData = this.fetchedData.concat(result.filter((elem) => elem));
      }

      if (!hasPreviousPage || reachDateThreshold) {
        // set pagination false to prevent further fetching
        this.pagination = false;
      }
    } else {
      this.warningCount += 1;
      console.log('Warning: no available data for issues. owner:', owner,
        'name:', name, 'pageCount:', pageCount, 'error message:', errors);
      return await this._handleWarning(this._fetchIssues);
    }
  }

  _fetchPullRequests = async () => {
    const owner = this.repoOwner;
    const name = this.repoName;
    const perPage = this._slowStart();
    const cursor = this.cursor;
    const orderBy = this.orderBy;
    const pageCount = this.pageCount;
    const earliestDate = this.earliestDate;

    if (DEBUG) {
      console.log('\nfetch pull requests, owner:', owner, 'name:', name,
        'cursor:', cursor, 'page count:', pageCount);
    }

    let data, errors, hasPreviousPage = false, reachDateThreshold = false;
    try {
      ({ data, errors } = await this.client.query(
        GITHUB_PR_INFO_QUERY,
        {owner, name, perPage, before: cursor, orderBy}
      ));
    } catch (error) {
      console.log('fetch pull request fails, owner:', owner, 'name:', name,
        'cursor:', cursor, 'error:', error);
    }
    if (data && data.repository) {
      // update rate limit
      this._updateRateLimit(data.rateLimit);

      this.pageCount++;
      const { nodes, pageInfo } = data.repository.pullRequests;
      this.cursor = pageInfo.startCursor;
      hasPreviousPage = pageInfo.hasPreviousPage;
      const result = await Promise.all(nodes.map(async node => {
        if (getTime(node.updatedAt) < getTime(earliestDate)) {
          reachDateThreshold = true;
          return null;
        }
        let info = this._mapNodeToIssue(node);

        let rawComments, comments;
        // collect review comments
        rawComments = node.reviews.nodes.map(node => node.comments.nodes);
        rawComments = [].concat.apply([], rawComments);
        // collect issue comments
        rawComments = rawComments.concat(node.comments.nodes);

        // fetch reactions only if there are reactions within that PR
        // to reduce API hits.
        // trick: a comment has received reaction(s) iff
        // reactionGroup.createdAt attribute is not null
        const hasReactions = rawComments.reduce((has, rawComment) => {
          return has || rawComment.reactionGroups.reduce((flag, node) => {
            return (flag || node.createdAt) ? true : false;
          }, false);
        }, false);

        if (hasReactions) {
          if (DEBUG) {
            console.log('pull request has reactions. repoOwner:', owner,
              'repoName:', name, 'pullRequest number:', node.number);
          }
          const number = node.number;
          const reviewsCount = Math.min(node.reviews.totalCount, 20);
          // max number of discussions within a review
          const discussionsPerReview = Math.min(
            node.reviews.nodes.reduce(
              (max, review) => Math.max(max, review.comments.totalCount), 0),
            100);
          const commentsCount = Math.min(node.comments.totalCount, 100);

          const commentsWithReactions = await new GraphQLClient(this.token,
            this.ignoreAuthor, this.ignoreContent,
            this.emitter, this.sleepTime, 3)
            .repo(this.repoOwner, this.repoName)
            .reactions({pr_number: number,
              reviews_count: reviewsCount,
              discussions_per_review: discussionsPerReview,
              comments_count: commentsCount})
            .fetchOne();

          // merge rawComments with commentsWithReactions
          if (commentsWithReactions &&
            commentsWithReactions.length === rawComments.length) {
            rawComments.forEach((comment, index) => {
              if (comment.id !== commentsWithReactions[index].id) {
                console.log('warning: comments and reactions do not fit!',
                  'pr number:', number, 'comment.id:', comment.id,
                  'comment with reactions id:', commentsWithReactions[index].id);
              } else {
                comment.reactions = commentsWithReactions[index].reactions;
              }
            });
          }
        }
        // filter out useless reviews
        rawComments = rawComments.filter(node => {
          let flag = true;
          // filter comments that don't need meta-reviews
          for (const ignoreContent of this.ignoreContent.split(' ')) {
            if (node.bodyText.match(ignoreContent)) {
              // filter reviews with specific content
              flag = false;
            }
          }
          for (const ignoreAuthor of this.ignoreAuthor.split(' ')) {
            if (node.author && node.author.login === ignoreAuthor) {
              // filter reviews done by specific authors
              flag = false;
            }
          }
          return flag;
        });

        comments = rawComments.map(node => {
          let commentAuthor, reactions;

          if (node.author) {
            commentAuthor = {
              login: node.author.login,
              avatarUrl: node.author.avatarUrl,
              name: node.author.name,
            };
          } else {
            commentAuthor = {
              login: null,
              avatarUrl: null,
            };
          }

          if (node.reactions) reactions = node.reactions.nodes;

          return {
            id: node.id,
            url: node.url,
            bodyText: node.bodyText,
            diffHunk: node.diffHunk || null,
            author: commentAuthor,
            reactions,
            createdAt: node.createdAt,
            lastEditedAt: node.lastEditedAt,
            // the native `updatedAt` field of comment is inaccurate
            updatedAt: node.lastEditedAt || node.createdAt,
          };
        });
        info.issue.pullRequest = {
          htmlUrl: node.url,
          comments,
        };
        return info;
      }).filter((node) => node));

      // store fetched data within this page
      if (!this.fetchedData) {
        this.fetchedData = [];
      }

      if (result && result.length) {
        // filter out null element
        this.fetchedData = this.fetchedData.concat(result.filter((elem) => elem));
      }

      if (!hasPreviousPage || reachDateThreshold) {
        // set pagination false to prevent further fetching
        this.pagination = false;
      }
    } else {
      this.warningCount += 1;
      console.log('Warning: no available data for pull request. owner:', owner,
        'name:', name, 'pageCount:', pageCount, 'error message:', errors);
      return await this._handleWarning(this._fetchPullRequests);
    }
  }

  _mapNodeToIssue(node) {
    let user, assignee, milestone;

    if (node.author) {
      user = {
        login: node.author.login,
        avatarUrl: node.author.avatarUrl,
      };
    } else {
      user = {
        login: null,
        avatarUrl: null,
      };
    }

    if (node.assignees.nodes && node.assignees.nodes.length) {
      assignee = {
        login: node.assignees.nodes[0].login,
        avatarUrl: node.assignees.nodes[0].avatarUrl,
      };
    }

    if (node.milestone) {
      milestone = {
        title: node.milestone.title,
        createdAt: node.milestone.createdAt,
        dueOn: node.milestone.dueOn,
        state: node.milestone.state.toLowerCase(),
        htmlUrl: node.milestone.url,
        description: node.milestone.description,
      };
    }

    const result = {
      repoOwner: this.repoOwner,
      repoName: this.repoName,
      updatedAtMs: getTime(node.updatedAt),
      issue: {
        htmlUrl: node.url,
        number: node.number,
        title: node.title,
        body: node.bodyText,
        comments: node.comments.totalCount,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        closedAt: node.closedAt,
        state: node.state.toLowerCase(),
        user,
        owner: user,
        assignee,
        milestone,
        labels: node.labels.nodes.map(label => ({
          name: label.name,
          color: label.color,
        }))
      }
    };
    return result;
  }

  _slowStart() {
    // strategy to save API limit and network bandwidth
    // a common senario of the client is to sync updated issues/prs
    // it is a waste to fetch `this.perPage` every time
    if (!this.slowStartPerPage) {
      this.slowStartPerPage = 1;
    } else if (this.slowStartPerPage * 2 < this.perPage) {
      this.slowStartPerPage *= 2;
    } else {
      this.slowStartPerPage = this.perPage;
    }
    return this.slowStartPerPage;
  }

  async _handleWarning(redoAction) {
    const warningCount = this.warningCount;
    if (warningCount < this.warningThreshold) {
      console.log('warning count:', warningCount, '<',
        'warning threshold', this.warningThreshold, 'redo fetching');
      await sleep(this.sleepTime);
      return await redoAction();
    } else {
      console.log('warning count:', warningCount, 'reaches warning threshold',
        this.warningThreshold, 'stop fetching');
      // stop pagination, if any
      this.pagination = false;
    }
  }
}

export default GraphQLClient;
