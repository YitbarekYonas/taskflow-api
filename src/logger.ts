import {config} from "./config.js";
const levels = {debug: 0,info: 1, error : 2} as const;
type Level = keyof typeof levels;
function log(level: Level, ...args:unknown[]){
    if(levels[level] >= levels[config.logLevel]){
        console.log(`[${level}]`,...args);
    }
}
export const logger = {
    debug : (...a: unknown[]) => log("debug",...a),
    info : (...a: unknown[]) => log("info" , ...a),
    error : (...a: unknown[]) => log("error",...a),
};
