export const convertDateTime = async (date: Date) => {
  const timezoneMinutes = date.getTimezoneOffset();

  const offset = timezoneMinutes * 60000;

  const timestamp = date.getTime();

  const utcTimestamp = timestamp + offset;

  const convertedDate = new Date(utcTimestamp);

  return convertedDate;
};
