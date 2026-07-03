import { createLogger, format, transports } from 'winston';
import { DEBUG, LOGS_PATH } from "./constants/config";

const { combine, timestamp, printf } = format;

const logger = createLogger({
    format: combine(
        timestamp(),
        printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
        new transports.Console({ level: DEBUG ? 'info' : 'debug' }),
        new transports.File({ filename: `${LOGS_PATH}/error.log`, level: 'error' }),
        new transports.File({ filename: `${LOGS_PATH}/combined.log`, level: 'debug' }),
    ],
});

export default logger;
