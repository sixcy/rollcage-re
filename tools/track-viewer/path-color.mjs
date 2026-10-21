// Fixed palette indexed by the authored group ID, independent of filtering.
const colors = ['#ffcc66', '#5ee0ff', '#ff80ba', '#99ed77', '#bc9cff', '#ff9566', '#69e2bd', '#efdf82'];
export function pathColor(index) { return colors[index % colors.length]; }
