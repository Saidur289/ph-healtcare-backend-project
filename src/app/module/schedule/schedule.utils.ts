export const convertDateTime = async (date: Date) => {
    console.log("Original Date:", date);

    const timezoneMinutes = date.getTimezoneOffset();
    console.log("Timezone Offset (minutes):", timezoneMinutes);

    const offset = timezoneMinutes * 60000;
    console.log("Offset in milliseconds:", offset);

    const timestamp = date.getTime();
    console.log("Original Timestamp:", timestamp);

    const utcTimestamp = timestamp + offset;
    console.log("UTC Timestamp:", utcTimestamp);

    const convertedDate = new Date(utcTimestamp);
    console.log("Converted Date:", convertedDate);

    return convertedDate;
}