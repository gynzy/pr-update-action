const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const baseTokenRegex = new RegExp('%basebranch%', "g");
    const headTokenRegex = new RegExp('%headbranch%', "g");
    const prNumberRegex = new RegExp('%prnumber%', "g");
    const noMatchRegex = new RegExp('%NOMATCH%', "g");

    const inputs = {
      token: core.getInput('repo-token', {required: true}),
      baseBranchRegex: core.getInput('base-branch-regex'),
      headBranchRegex: core.getInput('head-branch-regex'),
      lowercaseBranch: (core.getInput('lowercase-branch').toLowerCase() === 'true'),
      titleTemplate: core.getInput('title-template'),
      titleUpdateAction: core.getInput('title-update-action').toLowerCase(),
      titleInsertSpace: (core.getInput('title-insert-space').toLowerCase() === 'true'),
      titleUppercaseBaseMatch: (core.getInput('title-uppercase-base-match').toLowerCase() === 'true'),
      titleUppercaseHeadMatch: (core.getInput('title-uppercase-head-match').toLowerCase() === 'true'),
      bodyTemplate: core.getInput('body-template'),
      bodyUpdateAction: core.getInput('body-update-action').toLowerCase(),
      bodyNewlineCount: parseInt(core.getInput('body-newline-count')),
      bodyUppercaseBaseMatch: (core.getInput('body-uppercase-base-match').toLowerCase() === 'true'),
      bodyUppercaseHeadMatch: (core.getInput('body-uppercase-head-match').toLowerCase() === 'true'),
    }
    
    const baseBranchRegex = inputs.baseBranchRegex.trim();
    const matchBaseBranch = baseBranchRegex.length > 0;
    
    const headBranchRegex = inputs.headBranchRegex.trim();
    const matchHeadBranch = headBranchRegex.length > 0;

    let baseMatch = '%NOMATCH%';
    if (matchBaseBranch) {
      const baseBranchName = github.context.payload.pull_request.base.ref;
      const baseBranch = inputs.lowercaseBranch ? baseBranchName.toLowerCase() : baseBranchName;
      core.info(`Base branch: ${baseBranch}`);

      const baseMatches = baseBranch.match(new RegExp(baseBranchRegex));
      if (!baseMatches) {
        core.info('Base branch name does not match given regex');
      } else {
        baseMatch = baseMatches[0];
        core.info(`Matched base branch text: ${baseMatch}`);

        core.setOutput('baseMatch', baseMatch);
      }
    }

    let headMatch = '%NOMATCH%';
    if (matchHeadBranch) {
      const headBranchName = github.context.payload.pull_request.head.ref;
      const headBranch = inputs.lowercaseBranch ? headBranchName.toLowerCase() : headBranchName;
      core.info(`Head branch: ${headBranch}`);

      const headMatches = headBranch.match(new RegExp(headBranchRegex));
      if (!headMatches) {
        core.info('Head branch name does not match given regex');
      } else {
        headMatch = headMatches[0];
        core.info(`Matched head branch text: ${headMatch}`);

        core.setOutput('headMatch', headMatch);
      }
    }

    const request = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.payload.pull_request.number,
    }

    const upperCase = (upperCase, text) => upperCase ? text.toUpperCase() : text;

    const title = github.context.payload.pull_request.title || '';
    const processedTitleText = inputs.titleTemplate
      .split('\n')
      .map(line => { 
        return line
          .replace(baseTokenRegex, upperCase(inputs.bodyUppercaseBaseMatch, baseMatch))
          .replace(headTokenRegex, upperCase(inputs.bodyUppercaseHeadMatch, headMatch))
          .replace(prNumberRegex, github.context.payload.pull_request.number);
      })
      .filter(line => line.match(noMatchRegex) === null)
      .join(inputs.titleInsertSpace ? ' ': '');
    core.info(`Processed title text: ${processedTitleText}`);

    const updateTitle = ({
      prefix: !title.toLowerCase().startsWith(processedTitleText.toLowerCase()),
      suffix: !title.toLowerCase().endsWith(processedTitleText.toLowerCase()),
      replace: title.toLowerCase() !== processedTitleText.toLowerCase(),
    })[inputs.titleUpdateAction] || false;

    if (updateTitle) {
      request.title = ({
        prefix: processedTitleText.concat(inputs.titleInsertSpace ? ' ': '', title),
        suffix: title.concat(inputs.titleInsertSpace ? ' ': '', processedTitleText),
        replace: processedTitleText,
      })[inputs.titleUpdateAction];
      core.info(`New title: ${request.title}`);
    } else {
      core.info('No updates were made to PR title');
    }
    core.setOutput('titleUpdated', updateTitle.toString());

    const body = github.context.payload.pull_request.body || '';
    const processedBodyText = inputs.bodyTemplate
      .split('\n')
      .map(line => { 
        return line
          .replace(baseTokenRegex, upperCase(inputs.bodyUppercaseBaseMatch, baseMatch))
          .replace(headTokenRegex, upperCase(inputs.bodyUppercaseHeadMatch, headMatch))
          .replace(prNumberRegex, github.context.payload.pull_request.number);
      })
      .filter(line => line.match(noMatchRegex) === null)
      .join('\n');
    core.info(`Processed body text: ${processedBodyText}`);

    const updateBody = ({
      prefix: !body.toLowerCase().startsWith(processedBodyText.toLowerCase()),
      suffix: !body.toLowerCase().endsWith(processedBodyText.toLowerCase()),
      replace: body.toLowerCase() !== processedBodyText.toLowerCase(),
    })[inputs.bodyUpdateAction] || false;

    core.setOutput('bodyUpdated', updateBody.toString());

    if (updateBody) {
      request.body = ({
        prefix: processedBodyText.concat('\n'.repeat(inputs.bodyNewlineCount), body),
        suffix: body.concat('\n'.repeat(inputs.bodyNewlineCount), processedBodyText),
        replace: processedBodyText,
      })[inputs.bodyUpdateAction];
      core.debug(`New body: ${request.body}`);
    } else {
      core.info('No updates were made to PR body');
    }

    if (!updateTitle && !updateBody) {
      return;
    }

    const octokit = github.getOctokit(inputs.token);
    const response = await octokit.pulls.update(request);

    core.info(`Response: ${response.status}`);
    if (response.status !== 200) {
      core.error('Updating the pull request has failed');
    }
  }
  catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run()
