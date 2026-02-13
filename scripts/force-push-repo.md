# force push repo to remote

```cmd
cd speedy-git-ext/test-repo
gh repo delete onlineeric/test-repo --yes
gh repo create onlineeric/test-repo --private --source=. --push
git push -u --all origin && git push --tags origin
```

## if ssh connection failed
connect again:
`git remote set-url origin git@github.com:onlineeric/test-repo.git`