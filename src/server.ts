import app from "./app";

const bootstrap = () => {
    try {
        app.listen(5000, () => {
            console.log(`Server running at http://localhost:5000`);
        });
    } catch {
        console.error("Something happen in server")
    }
}
bootstrap()