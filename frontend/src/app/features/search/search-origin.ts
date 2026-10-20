/** Where the header search pill sits when the shopper opens search; the panel field morphs from it. */
export interface SearchOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  borderColor: string;
  backgroundColor: string;
  boxShadow: string;
  /** Top of the header's main bar, so the sheet's bar lines up with it (utility bar may be above). */
  barTop: number;
}
