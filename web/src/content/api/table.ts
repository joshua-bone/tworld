export interface TableCell {
  span: number;
  align: string;
  text: string;
}

export interface TableSpec {
  rows: number;
  cols: number;
  sep: number;
  collapse: number;
  data: TableCell[][];
}
