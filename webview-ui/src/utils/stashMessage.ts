// Default stash message used when the selective-stash input is left blank.
// Format is fixed per spec FR-032 and must match the test literal.
export function buildDefaultStashMessage(fileCount: number, branchName: string): string {
  return `Stash of ${fileCount} files from ${branchName}`;
}
