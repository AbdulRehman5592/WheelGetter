// Helper function to get environment variables and throw an error if they are not set
export const getEnvVariable = (key: string, defaultValue?: string): string => {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Environment variable ${key} is not defined`);
    }
    return value;
};