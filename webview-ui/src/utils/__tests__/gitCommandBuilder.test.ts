import { describe, it, expect } from 'vitest';
import {
  buildPushCommand,
  buildMergeCommand,
  buildRebaseCommand,
  buildCherryPickCommand,
  buildResetCommand,
  buildRevertCommand,
  buildDropCommitCommand,
  buildCheckoutCommand,
  buildTagCommand,
  buildDeleteBranchCommand,
  buildDeleteRemoteBranchCommand,
  buildDeleteTagCommand,
  buildDropStashCommand,
  buildStashAndCheckoutCommand,
  buildRenameBranchCommand,
} from '../gitCommandBuilder';

describe('buildPushCommand', () => {
  it('builds default push command', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'main', setUpstream: false, forceMode: 'none' }))
      .toBe('git push origin main');
  });

  it('includes -u when setUpstream is true', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'main', setUpstream: true, forceMode: 'none' }))
      .toBe('git push -u origin main');
  });

  it('includes --force-with-lease', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'feat', setUpstream: false, forceMode: 'force-with-lease' }))
      .toBe('git push --force-with-lease origin feat');
  });

  it('includes --force', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'feat', setUpstream: false, forceMode: 'force' }))
      .toBe('git push --force origin feat');
  });

  it('combines -u and --force-with-lease', () => {
    expect(buildPushCommand({ remote: 'upstream', branch: 'dev', setUpstream: true, forceMode: 'force-with-lease' }))
      .toBe('git push -u --force-with-lease upstream dev');
  });
});

describe('buildMergeCommand', () => {
  it('builds default merge command', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: false }))
      .toBe('git merge feature');
  });

  it('includes --no-ff alone', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: true }))
      .toBe('git merge --no-ff feature');
  });

  it('includes --no-commit with implied --no-ff', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: true, noFastForward: false }))
      .toBe('git merge --no-commit --no-ff feature');
  });

  it('includes --squash', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: false, squash: true }))
      .toBe('git merge --squash feature');
  });

  it('combines --squash with --no-commit', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: true, noFastForward: false, squash: true }))
      .toBe('git merge --squash --no-commit --no-ff feature');
  });
});

describe('buildRebaseCommand', () => {
  it('builds default rebase command', () => {
    expect(buildRebaseCommand({ targetRef: 'main', ignoreDate: false }))
      .toBe('git rebase main');
  });

  it('includes --ignore-date', () => {
    expect(buildRebaseCommand({ targetRef: 'origin/main', ignoreDate: true }))
      .toBe('git rebase --ignore-date origin/main');
  });
});

describe('buildCherryPickCommand', () => {
  it('builds single hash cherry-pick', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: false, noCommit: false }))
      .toBe('git cherry-pick abc1234');
  });

  it('builds multiple hash cherry-pick', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234', 'def5678'], appendSourceRef: false, noCommit: false }))
      .toBe('git cherry-pick abc1234 def5678');
  });

  it('includes -x when appendSourceRef is true', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: false }))
      .toBe('git cherry-pick -x abc1234');
  });

  it('suppresses -x when noCommit is true', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: true }))
      .toBe('git cherry-pick --no-commit abc1234');
  });

  it('includes -m N for mainlineParent', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: false, noCommit: false, mainlineParent: 1 }))
      .toBe('git cherry-pick -m 1 abc1234');
  });

  it('combines -m N and -x', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: false, mainlineParent: 2 }))
      .toBe('git cherry-pick -m 2 -x abc1234');
  });
});

describe('buildResetCommand', () => {
  it('builds --soft reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'soft' }))
      .toBe('git reset --soft abc1234');
  });

  it('builds --mixed reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'mixed' }))
      .toBe('git reset --mixed abc1234');
  });

  it('builds --hard reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'hard' }))
      .toBe('git reset --hard abc1234');
  });
});

describe('buildRevertCommand', () => {
  it('builds default revert with --no-edit', () => {
    expect(buildRevertCommand({ hash: 'abc1234' }))
      .toBe('git revert --no-edit abc1234');
  });

  it('includes -m N for mainlineParent', () => {
    expect(buildRevertCommand({ hash: 'abc1234', mainlineParent: 1 }))
      .toBe('git revert -m 1 --no-edit abc1234');
  });
});

describe('buildDropCommitCommand', () => {
  it('builds rebase-based drop command', () => {
    expect(buildDropCommitCommand({ hash: 'abc1234' }))
      .toBe('git rebase -i abc1234~1  # drop abc1234');
  });
});

describe('buildCheckoutCommand', () => {
  it('builds checkout without pull', () => {
    expect(buildCheckoutCommand({ branch: 'feature', pull: false }))
      .toBe('git checkout feature');
  });

  it('builds checkout with pull', () => {
    expect(buildCheckoutCommand({ branch: 'feature', pull: true }))
      .toBe('git checkout feature && git pull');
  });
});

describe('buildTagCommand', () => {
  it('builds lightweight tag', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234' }))
      .toBe('git tag v1.0.0 abc1234');
  });

  it('builds annotated tag with message', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', message: 'Release 1.0.0' }))
      .toBe('git tag -a v1.0.0 -m "Release 1.0.0" abc1234');
  });

  it('escapes double quotes in annotation message', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', message: 'Release "v1"' }))
      .toBe('git tag -a v1.0.0 -m "Release \\"v1\\"" abc1234');
  });
});

describe('buildDeleteBranchCommand', () => {
  it('builds default delete branch command', () => {
    expect(buildDeleteBranchCommand({ name: 'feature' }))
      .toBe('git branch -d feature');
  });

  it('builds force delete branch command', () => {
    expect(buildDeleteBranchCommand({ name: 'feature', force: true }))
      .toBe('git branch -D feature');
  });
});

describe('buildDeleteRemoteBranchCommand', () => {
  it('builds delete remote branch command', () => {
    expect(buildDeleteRemoteBranchCommand({ remote: 'origin', name: 'feature' }))
      .toBe('git push origin --delete feature');
  });
});

describe('buildDeleteTagCommand', () => {
  it('builds delete tag command', () => {
    expect(buildDeleteTagCommand({ name: 'v1.0.0' }))
      .toBe('git tag -d v1.0.0');
  });
});

describe('buildDropStashCommand', () => {
  it('builds drop stash command', () => {
    expect(buildDropStashCommand({ stashIndex: 0 }))
      .toBe('git stash drop stash@{0}');
  });

  it('builds drop stash command with higher index', () => {
    expect(buildDropStashCommand({ stashIndex: 3 }))
      .toBe('git stash drop stash@{3}');
  });
});

describe('buildStashAndCheckoutCommand', () => {
  it('builds stash and checkout without pull', () => {
    expect(buildStashAndCheckoutCommand({ branch: 'feature', pull: false }))
      .toBe('git stash && git checkout feature');
  });

  it('builds stash and checkout with pull', () => {
    expect(buildStashAndCheckoutCommand({ branch: 'feature', pull: true }))
      .toBe('git stash && git checkout feature && git pull');
  });
});

describe('buildRenameBranchCommand', () => {
  it('builds rename branch command', () => {
    expect(buildRenameBranchCommand({ oldName: 'old-branch', newName: 'new-branch' }))
      .toBe('git branch -m old-branch new-branch');
  });
});
