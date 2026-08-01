type QueryError = { message: string };

export function requireSupabaseData<T>(
  result: { data: T; error: QueryError | null },
  context: string
) {
  if (result.error) {
    throw new Error(`${context}：${result.error.message}`, { cause: result.error });
  }
  return result.data;
}
