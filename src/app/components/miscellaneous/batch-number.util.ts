export function extractBatchNumber(line: Record<string, unknown>): string {
  const batches = ['batches', 'BatchNumbers', 'batchNumbers', 'batch_numbers']
    .map((key) => line[key])
    .find(Array.isArray);
  const batchNumbers = (Array.isArray(batches) ? batches : [])
    .filter(
      (batch): batch is Record<string, unknown> =>
        !!batch && typeof batch === 'object' && !Array.isArray(batch),
    )
    .map((batch) =>
      pickBatchString(batch, [
        'BatchNum',
        'BatchNumber',
        'batchNumber',
        'batch_number',
        'BatchNo',
        'batchNo',
      ]),
    )
    .filter(Boolean);

  return (
    batchNumbers.join(', ') ||
    pickBatchString(line, [
      'SerialNum',
      'batchNumber',
      'BatchNum',
      'BatchNumber',
      'batch_number',
      'BatchNo',
      'batchNo',
      'Batch',
      'U_BatchNum',
    ])
  );
}

function pickBatchString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}
