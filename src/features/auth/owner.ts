export function isOwnerEmail(candidate: string, configuredOwner: string) {
  return candidate.trim().toLocaleLowerCase() === configuredOwner.trim().toLocaleLowerCase();
}

export function isOwnerUsername(candidate: string, configuredOwner: string) {
  return candidate.trim().toLocaleLowerCase() === configuredOwner.trim().toLocaleLowerCase();
}
