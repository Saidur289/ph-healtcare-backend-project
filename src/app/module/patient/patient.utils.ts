import { isValid, parse } from "date-fns";

export const convertDate = (date: string | undefined) => {
  if (!date) return undefined;
  const newDate = parse(date, "yyyy-MM-dd", new Date());
  if (!isValid(newDate)) return undefined;
  return newDate;
};
