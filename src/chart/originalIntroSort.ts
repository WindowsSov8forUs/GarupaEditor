/** ArraySortHelper IntroSort as shipped: length 2/3 swaps, insertion sort up to 16,
 * median-of-three partitioning, then heapsort once 2*FloorLog2PlusOne(length) is spent. */
export function originalIntroSort<T>(items: T[], lo: number, hi: number, compare: (left: T, right: T) => number): void {
  const swap = (a: number, b: number) => { const value = items[a]!; items[a] = items[b]!; items[b] = value; };
  const swapIfGreater = (a: number, b: number) => { if (a !== b && compare(items[a]!, items[b]!) > 0) swap(a, b); };
  const insertionSort = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      let j = i;
      const value = items[i + 1]!;
      while (j >= from && compare(value, items[j]!) < 0) { items[j + 1] = items[j]!; j--; }
      items[j + 1] = value;
    }
  };
  const downHeap = (start: number, n: number, from: number) => {
    let i = start;
    const value = items[from + i - 1]!;
    while (i <= n >> 1) {
      let child = 2 * i;
      if (child < n && compare(items[from + child - 1]!, items[from + child]!) < 0) child++;
      if (!(compare(value, items[from + child - 1]!) < 0)) break;
      items[from + i - 1] = items[from + child - 1]!;
      i = child;
    }
    items[from + i - 1] = value;
  };
  const heapsort = (from: number, to: number) => {
    const n = to - from + 1;
    for (let i = n >> 1; i >= 1; i--) downHeap(i, n, from);
    for (let i = n; i > 1; i--) { swap(from, from + i - 1); downHeap(1, i - 1, from); }
  };
  const partition = (from: number, to: number) => {
    const middle = from + ((to - from) >> 1);
    swapIfGreater(from, middle);
    swapIfGreater(from, to);
    swapIfGreater(middle, to);
    const pivot = items[middle]!;
    swap(middle, to - 1);
    let left = from, right = to - 1;
    while (left < right) {
      while (compare(items[++left]!, pivot) < 0) { /* advance */ }
      while (compare(pivot, items[--right]!) < 0) { /* retreat */ }
      if (left >= right) break;
      swap(left, right);
    }
    swap(left, to - 1);
    return left;
  };
  const sort = (from: number, to: number, depth: number) => {
    while (to > from) {
      const size = to - from + 1;
      if (size <= 16) {
        if (size === 2) swapIfGreater(from, to);
        else if (size === 3) { swapIfGreater(from, to - 1); swapIfGreater(from, to); swapIfGreater(to - 1, to); }
        else insertionSort(from, to);
        return;
      }
      if (depth === 0) { heapsort(from, to); return; }
      depth--;
      const pivot = partition(from, to);
      sort(pivot + 1, to, depth);
      to = pivot - 1;
    }
  };
  const length = hi - lo + 1;
  if (length < 2) return;
  let floorLog2PlusOne = 0;
  for (let n = length; n >= 1; n = Math.floor(n / 2)) floorLog2PlusOne++;
  sort(lo, hi, 2 * floorLog2PlusOne);
}
