import app from "./app";
import { envVars } from "./app/config/env";

const bootstrap = () => {
    try {
        app.listen(envVars.PORT, () => {
            console.log(`Server running at http://localhost:${envVars.PORT}`);
        });
    } catch {
        console.error("Something happen in server")
    }
}
bootstrap()