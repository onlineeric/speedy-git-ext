# Upgrade this test-repo generate script.

## Goal

Upgrade this test-repo generate script, generate a more realistic test-repo, with a sub-repo.

## Requirements

- extension Authors to 100+ people
- generate 500000+ commits.
- history should be 10+ years.

## Author pool

Create Author pool, assume author worked in this company (repo) for different time and period:

- 100+ Authors
- 1/4 people worked from day 1 for 3 - 5 years long.
- 1/4 people currently still working and worked 3 - 5 years long
- 1/2 people worked only 1 to 5 years and have left, join date split cross anytime

in this situation, people in the first few years all left, in the last few years won't see their commits.

people join in the pass few years they only contributed commits in last few years, can't find their commits in earlier year.

## Branches

- from day one we already have `main` branch, then create `dev` branch from it.
- every month create release branch from main, fromat `release/v1.x.x` , increase the version number, every year increate major version. Add a tag with version on it.
- we create a lot of other branches, all use properbility to generate.

