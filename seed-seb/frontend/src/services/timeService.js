import axios from 'axios';

class TimeService {
    constructor() {
        this.offset = 0; // offset in milliseconds: (onlineTime - localTime)
        this.isInitialized = false;
        this.lastFetchTime = null;
    }

    /**
     * Initialize the time service by fetching Indian Standard Time from a reliable API
     * and calculating the offset against the local system clock.
     */
    async init() {
        if (this.isInitialized && this.lastFetchTime && (Date.now() - this.lastFetchTime < 30 * 60 * 1000)) {
            // Already initialized recently (within 30 mins), skip
            return;
        }

        const apis = [
            'https://worldtimeapi.org/api/timezone/Asia/Kolkata',
            'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata'
        ];

        for (const api of apis) {
            try {
                const response = await axios.get(api, { timeout: 5000 });
                let onlineTime;
                
                if (api.includes('worldtimeapi')) {
                    onlineTime = new Date(response.data.datetime).getTime();
                } else {
                    onlineTime = new Date(response.data.dateTime).getTime();
                }

                if (isNaN(onlineTime)) continue;

                const localTime = Date.now();
                this.offset = onlineTime - localTime;
                this.isInitialized = true;
                this.lastFetchTime = localTime;
                
                console.log(`[TimeService] Sync successful via ${api}. Offset: ${this.offset}ms`);
                return;
            } catch (error) {
                console.warn(`[TimeService] API ${api} failed:`, error.message);
            }
        }

        console.warn('[TimeService] All time APIs failed. Using local system time as fallback.');
    }

    /**
     * Returns a Date object adjusted for the online offset
     * @returns {Date}
     */
    getNow() {
        return new Date(Date.now() + this.offset);
    }

    /**
     * Returns the current timestamp in milliseconds adjusted for the online offset
     * @returns {number}
     */
    now() {
        return Date.now() + this.offset;
    }

    /**
     * Forces a re-sync with the online time server
     */
    async sync() {
        await this.init();
    }
}

const timeService = new TimeService();
export default timeService;
