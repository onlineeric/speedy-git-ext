/** An author as git prints it — `Name <email>` — or just the name when the email is empty. */
export function formatAuthorIdentity(name: string, email: string): string {
  return email ? `${name} <${email}>` : name;
}
