import React, { useState, useEffect } from 'react';
import { FaDownload, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import DataService from '../services/dataService';
import { API_ENDPOINTS, FILE_TYPES } from '../config/constants';
import timeService from '../services/timeService';
import { getAuthData } from '../utils/storageUtils';
import { toast } from 'sonner';
import '../styles/Assessment.css';

// Define a loading spinner animation
const loadingSpinnerStyles = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;

const Assessment = ({ isOpen, onClose, user, isRunningInPyQt }) => {
    const [isAssessmentStarted, setIsAssessmentStarted] = useState(false);
    const [accessControl, setAccessControl] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedTitle, setSelectedTitle] = useState('');
    const [selectedModule, setSelectedModule] = useState(null);
    const [showIframeModal, setShowIframeModal] = useState(false);
    const [error, setError] = useState(null);
    const [isHackerRankAuthenticated, setIsHackerRankAuthenticated] = useState(false);
    const [isBeginLoading, setIsBeginLoading] = useState(false);
    const [moduleSearchTerm, setModuleSearchTerm] = useState('');
    const [passkey, setPasskey] = useState('');
    const [isPasskeyValidated, setIsPasskeyValidated] = useState(false);
    const [isValidatingPasskey, setIsValidatingPasskey] = useState(false);
    const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

    // Check for HackerRank authentication on component mount
    useEffect(() => {
        if (isOpen && isRunningInPyQt()) {
            // Check authentication status using both localStorage and sessionStorage
            const persistentAuth = localStorage.getItem('hackerRankAuth');
            const sessionAuth = sessionStorage.getItem('hackerRankAuthInProgress');

            console.log('Initial auth check - localStorage:', persistentAuth, 'sessionStorage:', sessionAuth);

            // If either storage has 'true', consider authenticated
            const isAuthenticated = persistentAuth === 'true' || sessionAuth === 'true';
            console.log('User authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');

            // Only set state based on existing values, don't initialize
            if (isAuthenticated) {
                // Keep storage in sync
                if (persistentAuth !== 'true') localStorage.setItem('hackerRankAuth', 'true');
                if (sessionAuth !== 'true') sessionStorage.setItem('hackerRankAuthInProgress', 'true');

                setIsHackerRankAuthenticated(true);
                loadAssessmentData();
            } else {
                setIsHackerRankAuthenticated(false);
            }
        }
    }, [isOpen, isRunningInPyQt]);

    // Auto-start assessment when both data pieces are available
    useEffect(() => {
        if (isOpen && accessControl && isRunningInPyQt()) {
            console.log('Both access control data is now available - starting assessment');
            setIsAssessmentStarted(true);
        }
    }, [isOpen, accessControl, isRunningInPyQt]);

    useEffect(() => {
        if (isOpen) {
            // Check and load data from localStorage when component opens
            loadDataFromLocalStorage();
        }
    }, [isOpen]);

    // Function to load data from localStorage
    const loadDataFromLocalStorage = () => {
        let foundAccessControl = false;

        // Try to load access control data from localStorage
        if (!accessControl) {
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                if (authData.accessControl) {
                    console.log('Loading access control data from localStorage');
                    setAccessControl(authData.accessControl);
                    foundAccessControl = true;
                } else {
                    console.log('No access control data found in localStorage');
                }
            } catch (e) {
                console.error('Error parsing auth_data from localStorage:', e);
            }
        } else {
            foundAccessControl = true;
        }

        setError(null);
        resetSelections();

        if (foundAccessControl && isRunningInPyQt()) {
            console.log('Access control data found - auto-starting assessment');
            setIsLoading(false);
            setIsAssessmentStarted(true);
        }
    };

    const resetSelections = () => {
        setSelectedSection('');
        setSelectedTitle('');
        setSelectedModule(null);
        setShowIframeModal(false);
        setError(null);
        setPasskey('');
        setIsPasskeyValidated(false);
        setIsValidatingPasskey(false);
    };

    // Function to check if HackerRank authentication is in progress or complete
    const checkHackerRankAuthentication = () => {
        if (isRunningInPyQt()) {
            console.log('Checking for HackerRank authentication status...');

            try {
                // First check localStorage (persistent across navigations)
                const persistentAuth = localStorage.getItem('hackerRankAuth');
                console.log('HackerRank localStorage authentication:', persistentAuth);

                // Then check sessionStorage (might be lost on navigation)
                const sessionAuth = sessionStorage.getItem('hackerRankAuthInProgress');
                console.log('HackerRank sessionStorage authentication:', sessionAuth);

                // If either one is true, consider the user authenticated
                const isAuthenticated = persistentAuth === 'true' || sessionAuth === 'true';
                console.log('Combined authentication status:', isAuthenticated);

                // Update React state
                setIsHackerRankAuthenticated(isAuthenticated);

                // Make sure both storage mechanisms are in sync if authenticated
                if (isAuthenticated) {
                    if (persistentAuth !== 'true') {
                        localStorage.setItem('hackerRankAuth', 'true');
                        console.log('Updated localStorage hackerRankAuth to true');
                    }
                    if (sessionAuth !== 'true') {
                        sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                        console.log('Updated sessionStorage hackerRankAuthInProgress to true');
                    }
                }

                return isAuthenticated;
            } catch (error) {
                console.error('Error checking HackerRank auth status:', error);
                return false;
            }
        }
        return false;
    };

    const startAssessment = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log(' STARTING ASSESSMENT PROCESS - DEBUGGING INFO:');
            console.log('User object:', user);

            // First check if running in PyQt environment
            // For development, we'll log a warning instead of throwing an error
            console.log(' Checking PyQt environment...');
            console.log('isRunningInPyQt function returns:', isRunningInPyQt());
            console.log('window.pyqtFlag =', window.pyqtFlag);
            console.log('navigator.userAgent =', navigator.userAgent);

            if (!isRunningInPyQt()) {
                console.warn('Assessment was designed for PyQt environment, but continuing for development purposes');

                // Development-only fallback
                if (process.env.NODE_ENV === 'development') {
                    console.log(' Development mode: proceeding with authentication check anyway');
                } else {
                    // In production, still enforce the PyQt requirement
                    throw new Error('Assessment environment initialization required.');
                }
            } else {
                console.log(' PyQt environment detected, proceeding normally');
            }

            // Log user info for debugging
            console.log('Starting assessment with user:', user);
            console.log('User details - Email:', user?.Email, 'College:', user?.College);

            if (!user?.Email || !user?.College) {
                console.error('Missing user data - Email:', user?.Email, 'College:', user?.College);
                throw new Error('User email or college information is missing');
            }

            // Check for HackerRank authentication status using our helper function
            console.log(' Checking HackerRank authentication status...');
            const isAuthenticated = checkHackerRankAuthentication();
            console.log('Authentication check result:', isAuthenticated);

            // If already authenticated, load assessment data
            if (isAuthenticated) {
                console.log(' HackerRank authentication is complete, loading assessment data');
                setIsHackerRankAuthenticated(true);
                await loadAssessmentData();
                return;
            }

            // Not authenticated, redirect to HackerRank
            console.log(' HackerRank authentication not complete, preparing to redirect to login');

            // The URL should be configured based on your environment
            const hackerRankAuthUrl = 'https://www.hackerrank.com/auth/login';
            console.log('HackerRank auth URL:', hackerRankAuthUrl);

            // Clear any existing auth flags before redirecting to ensure a clean start
            console.log(' Clearing existing authentication flags before redirect');
            localStorage.removeItem('hackerRankAuth');
            sessionStorage.removeItem('hackerRankAuthInProgress');
            setIsHackerRankAuthenticated(false);

            // PyQt INTEGRATION NOTES:
            // 1. The PyQt wrapper should intercept navigation to hackerrank.com domains
            // 2. PyQt should monitor the authentication process
            // 3. Once authentication is complete, PyQt should:
            //    a. Store any relevant cookies for future use
            //    b. Set hackerRankAuth to 'true' in localStorage 
            //    c. Set hackerRankAuthInProgress to 'true' in sessionStorage
            //    d. Navigate back to the SEED-IT dashboard

            console.log(' Redirecting to HackerRank auth in PyQt environment');

            // Redirect the current page to HackerRank - using a more reliable approach
            try {
                // Create a more reliable way to handle the redirect
                console.log(' Setting up redirect to:', hackerRankAuthUrl);

                // Keep the loading state active
                // The setTimeout ensures we show the loading animation for at least 1.5 seconds
                // even if there are issues with the redirect
                const redirectTimeout = setTimeout(() => {
                    console.log(' EXECUTING REDIRECT NOW');

                    // In some cases, directly assigning to location.href might be blocked
                    // Using location.replace as a more forceful alternative
                    try {
                        window.location.replace(hackerRankAuthUrl);
                    } catch (e) {
                        console.error('Replace failed, trying direct assignment:', e);
                        window.location.href = hackerRankAuthUrl;
                    }

                    // Backup approach - if neither method works, try opening in same tab
                    setTimeout(() => {
                        if (document.location.href !== hackerRankAuthUrl) {
                            console.log(' Primary redirect methods failed, trying window.open');
                            window.open(hackerRankAuthUrl, '_self');
                        }
                    }, 500);

                }, 1500); // Increased delay for better visual feedback

                // Safety timeout to ensure we reset loading state if redirect fails
                setTimeout(() => {
                    setIsLoading(false);
                }, 10000); // 10 seconds safety timeout

                return () => {
                    clearTimeout(redirectTimeout);
                };
            } catch (redirectError) {
                console.error('Error redirecting to HackerRank:', redirectError);
                setError('Failed to connect to HackerRank. Please try again.');
                setIsLoading(false);
            }

        } catch (error) {
            console.error('Error in startAssessment:', error);
            setError(error.message || 'Failed to start assessment. Please try again.');
            setIsAssessmentStarted(false);
            setIsLoading(false);
        }
    };

    // Function to load assessment data after authentication
    const loadAssessmentData = async () => {
        try {
            setIsLoading(true);

            if (accessControl) {
                console.log('Already have access control data in component state');
                setTimeout(() => {
                    setIsAssessmentStarted(true);
                    setIsLoading(false);
                }, 800);
                return;
            }

            // Get user info from localStorage
            let authData;
            try {
                authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                console.log('Current auth_data from localStorage:', authData);
            } catch (e) {
                console.error('Error parsing auth_data from localStorage:', e);
                authData = {};
            }

            // Fetch access control data if we don't have it
            if (!authData.accessControl) {
                console.log('Fetching access control data');
                try {
                    const data = await DataService.getAccessControl();
                    console.log('Received access control data:', data);

                    if (!data) {
                        throw new Error('No access control data found');
                    }

                    setAccessControl(data);

                    // Update auth_data with access control
                    const updatedAuthData = {
                        ...authData,
                        accessControl: data
                    };
                    localStorage.setItem("auth_data", JSON.stringify(updatedAuthData));

                } catch (error) {
                    console.error('Access control fetch error:', error);
                    throw new Error(`Failed to fetch access control data: ${error.message}`);
                }
            }

            console.log('Assessment data loaded successfully - opening dropdown modal');
            setIsAssessmentStarted(true);

        } catch (error) {
            console.error('Error in loadAssessmentData:', error);
            setError(error.message || 'Failed to load assessment data. Please try again.');
            setIsAssessmentStarted(false);
        } finally {
            setIsLoading(false);
        }
    };

    const checkModuleAccess = (section, moduleKey) => {
        console.log('Checking access for section:', section, 'moduleKey:', moduleKey);
        console.log('User data:', {
            College: user?.College,
            Department: user?.Department,
            Year: user?.Year,
            Premium: user?.Premium
        });
        console.log('Access Control Data:', accessControl);

        if (!accessControl || !user?.College || !user?.Department || !user?.Year) {
            console.log('Missing required data for access check');
            return false;
        }

        const module = accessControl.courses[section]?.modules[moduleKey];
        if (!module) {
            console.log('No module found');
            return false;
        }

        // Premium validation
        const isPremiumModule = !!module.isPremium;
        const isPremiumUser = Boolean(user?.isPremium);
        
        if (isPremiumModule && !isPremiumUser) {
            console.log('Access denied: Premium module for non-premium user');
            return false;
        }

        // Get module ID from courses structure
        const moduleId = module.id;
        console.log('Module ID:', moduleId);
        if (!moduleId) {
            console.log('No module ID found');
            return false;
        }

        // Get department access configuration
        const departmentAccess = accessControl.access_control?.colleges?.[user.college]?.[user.year]?.[user.department];
        console.log('Department Access:', departmentAccess);
        if (!departmentAccess) {
            console.log('No department access configuration found for:', {
                college: user.college,
                year: user.year,
                department: user.department
            });
            return false;
        }

        // Check batch dates
        const now = timeService.getNow();
        const batchStart = new Date(departmentAccess.batch_start);
        const batchEnd = new Date(departmentAccess.batch_end);
        console.log('Batch dates:', {
            now: now.toISOString(),
            start: batchStart.toISOString(),
            end: batchEnd.toISOString()
        });

        if (now < batchStart) {
            console.log('Access not yet started');
            return false;
        }
        if (now > batchEnd) {
            console.log('Access has expired');
            return false;
        }

        // Check if module is in allowed_modules
        const allowed = departmentAccess.allowed_modules?.includes(moduleId);
        console.log('Module access:', allowed, 'for moduleId:', moduleId, 'in allowed_modules:', departmentAccess.allowed_modules);
        return allowed;
    };

    const validatePasskey = async () => {
        if (!passkey.trim()) {
            setError('Please enter a passkey');
            return;
        }

        if (!selectedModule || !selectedTitle) {
            setError('Please select a module first');
            return;
        }

        setIsValidatingPasskey(true);
        setError(null);

        try {
            // Get the expected passkey from access_control.json
            const expectedPasskey = accessControl?.courses?.[selectedSection]?.modules?.[selectedTitle]?.passkey;

            if (!expectedPasskey) {
                setError('No passkey required for this module');
                setIsValidatingPasskey(false);
                return;
            }

            // Compare the entered passkey with the expected one
            if (passkey.trim() === expectedPasskey) {
                setIsPasskeyValidated(true);
                setError(null);
                console.log('Passkey validated successfully');
            } else {
                setError('Invalid passkey. Please try again.');
                setIsPasskeyValidated(false);
            }
        } catch (error) {
            console.error('Error validating passkey:', error);
            setError('Error validating passkey. Please try again.');
            setIsPasskeyValidated(false);
        } finally {
            setIsValidatingPasskey(false);
        }
    };

    const checkScheduleAccess = (moduleData) => {
        if (!moduleData?.schedule) {
            return { allowed: true, reason: 'No schedule restrictions' };
        }

        const schedule = moduleData.schedule;
        const now = timeService.getNow();

        // Convert to the specified timezone (default to local if not specified)
        const timezone = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Create date objects for start and end dates
        const startDate = new Date(schedule.startDate + 'T' + schedule.startTime);
        const endDate = new Date(schedule.endDate + 'T' + schedule.endTime);

        // Check if current date is within the overall date range
        if (now < startDate) {
            return {
                allowed: false,
                reason: `Assessment starts on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}`
            };
        }

        if (now > endDate) {
            return {
                allowed: false,
                reason: `Assessment ended on ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`
            };
        }

        // Check schedule type
        switch (schedule.type) {
            case 'one_time':
                // For one-time, check if current time is within the time window
                if (now >= startDate && now <= endDate) {
                    return { allowed: true, reason: 'Assessment is currently available' };
                } else {
                    return {
                        allowed: false,
                        reason: `Assessment is only available from ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`
                    };
                }

            case 'daily':
                // For daily, check if current time is within the daily time window
                const currentTime = now.getHours() * 60 + now.getMinutes(); // Convert to minutes
                const startTimeMinutes = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
                const endTimeMinutes = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);

                if (currentTime >= startTimeMinutes && currentTime <= endTimeMinutes) {
                    return { allowed: true, reason: 'Assessment is currently available' };
                } else {
                    return {
                        allowed: false,
                        reason: `Assessment is available daily from ${schedule.startTime} to ${schedule.endTime}`
                    };
                }

            case 'weekly':
                // For weekly, check if current day is allowed and time is within range
                const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const allowedDays = schedule.daysOfWeek || [];
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

                if (!allowedDays.includes(currentDay)) {
                    const allowedDayNames = allowedDays.map(day => dayNames[day]).join(', ');
                    return {
                        allowed: false,
                        reason: `Assessment is only available on: ${allowedDayNames}`
                    };
                }

                // Check time within daily window
                const currentTimeWeekly = now.getHours() * 60 + now.getMinutes();
                const startTimeMinutesWeekly = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
                const endTimeMinutesWeekly = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);

                if (currentTimeWeekly >= startTimeMinutesWeekly && currentTimeWeekly <= endTimeMinutesWeekly) {
                    return { allowed: true, reason: 'Assessment is currently available' };
                } else {
                    return {
                        allowed: false,
                        reason: `Assessment is available on ${dayNames[currentDay]} from ${schedule.startTime} to ${schedule.endTime}`
                    };
                }

            default:
                return { allowed: true, reason: 'No schedule restrictions' };
        }
    };

    const isAssessmentModule = () => {
        return selectedSection === 'assessments';
    };

    // Visibility helper: allow visibility if current date is within schedule date range
    const checkDateRangeAccess = (moduleData) => {
        if (!moduleData?.schedule) {
            return { allowed: true };
        }
        const { startDate, endDate } = moduleData.schedule;
        if (!startDate || !endDate) {
            return { allowed: true };
        }
        // Compare dates only (inclusive)
        const today = timeService.getNow();
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        return { allowed: today >= start && today <= end };
    };

    const handleBegin = () => {
        console.log('Begin button clicked with selectedModule:', selectedModule, 'selectedTitle:', selectedTitle);

        if (!selectedModule || !selectedTitle) {
            console.log('No module or title selected');
            setError('Please select a module to begin');
            return;
        }

        // Check if this is an assessment module and passkey validation is required
        if (isAssessmentModule() && !isPasskeyValidated) {
            setError('Please validate the passkey before beginning the assessment');
            return;
        }

        try {
            setIsBeginLoading(true);
            setError(null);

            const hasAccess = checkModuleAccess(selectedSection, selectedTitle);
            console.log('Has access to module:', hasAccess);

            if (!hasAccess) {
                const msg = 'You do not have access to this module. Please check your permissions.';
                setError(msg);
                toast.error(msg);
                setIsBeginLoading(false);
                return;
            }

            // Check schedule access
            const scheduleAccess = checkScheduleAccess(selectedModule);
            if (!scheduleAccess.allowed) {
                setError(`Schedule restriction: ${scheduleAccess.reason}`);
                setIsBeginLoading(false);
                return;
            }

            // Store the selected assessment URL for PyQt to reference
            if (selectedModule.url && selectedModule.url.includes('hackerrank.com')) {
                console.log('Storing hackerrank assessment URL:', selectedModule.url);

                // Store in window for PyQt to access
                window.currentHackerRankAssessmentUrl = selectedModule.url;

                // Store in sessionStorage for persistence during this session
                try {
                    sessionStorage.setItem('currentHackerRankAssessmentUrl', selectedModule.url);
                    console.log('Stored assessment URL in sessionStorage');
                } catch (storageError) {
                    console.error('Error storing URL in sessionStorage:', storageError);
                }
            }

            // Check if HackerRank authentication is required and present
            if (isHackerRankAuthenticated) {
                console.log('User is authenticated with HackerRank');

                // For authenticated users, open the URL directly, replacing current page
                if (isRunningInPyQt()) {
                    console.log('Opening URL in PyQt environment:', selectedModule.url);

                    // This should be handled by PyQt to replace the current window
                    // Rather than opening an iframe, we'll navigate to the URL directly
                    setTimeout(() => {
                        window.location.href = selectedModule.url;
                    }, 1000); // Add a small delay for a better user experience
                    return;
                }
            }

            // Fall back to iframe display if direct navigation not possible
            console.log('Opening modal with URL:', selectedModule.url);
            setShowIframeModal(true);
            setIsBeginLoading(false);
        } catch (error) {
            console.error('Error in handleBegin:', error);
            setError(`Error: ${error.message || 'An unknown error occurred'}`);
            setIsBeginLoading(false);
        }
    };

    const getSectionOptions = () => {
        if (!accessControl?.courses) {
            console.log('No courses data available');
            return [];
        }

        const options = Object.entries(accessControl.courses)
            .filter(([key]) => key !== 'mcqs') // Exclude MCQ section from Assessment tab
            .sort((a, b) => a[1].display_order - b[1].display_order)
            .map(([key, section]) => ({
                value: key,
                label: section.title || key
            }));

        console.log('Available sections:', options);
        return options;
    };

    const getTitleOptions = () => {
        if (!selectedSection || !accessControl?.courses?.[selectedSection]?.modules) {
            console.log('No modules available for section:', selectedSection);
            return [];
        }

        const options = Object.entries(accessControl.courses[selectedSection].modules)
            .sort((a, b) => a[1].display_order - b[1].display_order)
            .map(([key, module]) => {
                const moduleAccess = checkModuleAccess(selectedSection, key);
                const dateRangeAccess = checkDateRangeAccess(module); // visibility only by date range
                const scheduleAccess = checkScheduleAccess(module);   // used for Begin gating and tooltip

                // Premium check
                const isPremiumModule = !!module.isPremium;
                const isPremiumUser = Boolean(user?.isPremium);
                const premiumAccess = !isPremiumModule || isPremiumUser;

                // Visible in list if access granted, date range matches, and premium access is allowed
                const visible = moduleAccess && dateRangeAccess.allowed && premiumAccess;

                return {
                    value: key,
                    label: module.name || key,
                    enabled: visible,
                    scheduleInfo: scheduleAccess.reason,
                    moduleData: module
                };
            })
            .filter(option => option.enabled); // Only return visible modules

        console.log('Available modules (enabled only):', options);
        return options;
    };

    // PyQt Integration helper methods
    // These methods would be exposed to PyQt for communication with the web view

    // Method for PyQt to call when HackerRank authentication is complete
    window.onHackerRankAuthComplete = () => {
        console.log('HackerRank authentication completed - called from PyQt');
        if (isRunningInPyQt()) {
            // Set both flags to ensure persistence across navigation
            localStorage.setItem('hackerRankAuth', 'true');
            sessionStorage.setItem('hackerRankAuthInProgress', 'true');
            setIsHackerRankAuthenticated(true);

            // Note: Since this will be called while on the HackerRank site,
            // the component won't be mounted, so we don't call loadAssessmentData() here.
            // PyQt should navigate back to the dashboard after calling this.
            console.log('Authentication flags set to true, PyQt should redirect back to dashboard');
        }
    };

    // Method for PyQt to call to set the authentication status directly
    window.setHackerRankAuthStatus = (status) => {
        console.log('Setting HackerRank auth status:', status);
        if (isRunningInPyQt()) {
            const authValue = !!status;
            setIsHackerRankAuthenticated(authValue);

            // Update both storage mechanisms
            localStorage.setItem('hackerRankAuth', authValue ? 'true' : 'false');
            sessionStorage.setItem('hackerRankAuthInProgress', authValue ? 'true' : 'false');
            console.log('Authentication status updated to:', authValue ? 'true' : 'false', 'in both storage mechanisms');
        }
    };

    // Method for PyQt to check if the user is already in an assessment
    window.isInAssessment = () => {
        return isAssessmentStarted;
    };

    // Method for PyQt to call to trigger an immediate authentication check
    window.checkAndUpdateHackerRankAuth = () => {
        console.log('checkAndUpdateHackerRankAuth called by PyQt');
        if (isRunningInPyQt()) {
            // Get current auth status
            const persistentAuth = localStorage.getItem('hackerRankAuth');
            const sessionAuth = sessionStorage.getItem('hackerRankAuthInProgress');

            console.log('Manual auth check - localStorage:', persistentAuth, 'sessionStorage:', sessionAuth);

            // If either is true, update state and load data
            const isAuthenticated = persistentAuth === 'true' || sessionAuth === 'true';
            if (isAuthenticated) {
                console.log('Manual check found authenticated status, updating component');
                setIsHackerRankAuthenticated(true);
                if (!accessControl) {
                    loadAssessmentData();
                }
                return true;
            }
            return false;
        }
        return false;
    };

    // Special function that PyQt can call to force UI update
    window.updateAuthUI = (isAuthenticated) => {
        console.log('updateAuthUI called with:', isAuthenticated);

        const authValue = !!isAuthenticated;
        console.log('Setting UI authentication state to:', authValue);

        // Update React state
        setIsHackerRankAuthenticated(authValue);

        // Sync storage
        localStorage.setItem('hackerRankAuth', authValue ? 'true' : 'false');
        sessionStorage.setItem('hackerRankAuthInProgress', authValue ? 'true' : 'false');

        // If authenticated, load assessment data
        if (authValue && !accessControl) {
            console.log('Loading assessment data after UI update');
            loadAssessmentData();
        }

        return true;
    };

    // Method for PyQt to get the current HackerRank assessment URL
    window.getCurrentHackerRankAssessmentUrl = () => {
        // First try to get from the window object (set by handleBegin)
        if (window.currentHackerRankAssessmentUrl) {
            console.log('Returning assessment URL from window object:', window.currentHackerRankAssessmentUrl);
            return window.currentHackerRankAssessmentUrl;
        }

        // If not available, try to get from sessionStorage
        try {
            const storedUrl = sessionStorage.getItem('currentHackerRankAssessmentUrl');
            if (storedUrl) {
                console.log('Returning assessment URL from sessionStorage:', storedUrl);
                return storedUrl;
            }
        } catch (error) {
            console.error('Error getting URL from sessionStorage:', error);
        }

        console.log('No stored assessment URL found');
        return null;
    };

    // Expose the check function to window
    useEffect(() => {
        // Expose the checkHackerRankAuthentication function to PyQt
        window.checkHackerRankAuthentication = checkHackerRankAuthentication;
        window.checkAndUpdateHackerRankAuth = window.checkAndUpdateHackerRankAuth || (() => { });
        window.updateAuthUI = window.updateAuthUI || (() => { });
        window.getCurrentHackerRankAssessmentUrl = window.getCurrentHackerRankAssessmentUrl || (() => null);

        // Create a specific function for PyQt to call to clear auth flags, especially on app shutdown
        window.clearHackerRankAuth = () => {
            console.log('Explicitly clearing HackerRank auth flags (called from PyQt)');
            localStorage.removeItem('hackerRankAuth');
            sessionStorage.removeItem('hackerRankAuthInProgress');
            return true;
        };

        // Try to restore the current assessment URL from sessionStorage
        try {
            const storedUrl = sessionStorage.getItem('currentHackerRankAssessmentUrl');
            if (storedUrl) {
                console.log('Restored assessment URL from sessionStorage:', storedUrl);
                window.currentHackerRankAssessmentUrl = storedUrl;
            }
        } catch (error) {
            console.error('Error restoring URL from sessionStorage:', error);
        }

        return () => {
            // Clean up when component unmounts
            delete window.onHackerRankAuthComplete;
            delete window.setHackerRankAuthStatus;
            delete window.isInAssessment;
            delete window.checkHackerRankAuthentication;
            delete window.checkAndUpdateHackerRankAuth;
            delete window.updateAuthUI;
            delete window.getCurrentHackerRankAssessmentUrl;
            delete window.currentHackerRankAssessmentUrl;
            delete window.clearHackerRankAuth;

            // If the assessment is being closed and not completed,
            // clear the authentication status to not show dropdown next time it's opened
            if (!isAssessmentStarted) {
                console.log('Assessment closed without completion, cleaning up auth status');
                // Clear both storage mechanisms to ensure a fresh start next time
                localStorage.removeItem('hackerRankAuth');
                sessionStorage.removeItem('hackerRankAuthInProgress');
                console.log('Removed HackerRank auth flags from both localStorage and sessionStorage');
            }
        };
    }, [isOpen, isRunningInPyQt, isAssessmentStarted]);

    // Special handler for when PyQt might set auth flags immediately after page load
    useEffect(() => {
        // Function to handle storage changes
        const handleStorageChange = (event) => {
            if (event.key === 'hackerRankAuth' || event.key === 'hackerRankAuthInProgress') {
                console.log(`Storage changed: ${event.key} = ${event.newValue}`);

                // Re-check authentication status
                const isAuthenticated =
                    localStorage.getItem('hackerRankAuth') === 'true' ||
                    sessionStorage.getItem('hackerRankAuthInProgress') === 'true';

                console.log('Authentication status after storage change:', isAuthenticated);
                if (isAuthenticated) {
                    setIsHackerRankAuthenticated(true);
                    if (!accessControl) {
                        // Only load data if we don't have it already
                        loadAssessmentData();
                    }
                }
            }
        };

        // Add event listener for storage changes
        window.addEventListener('storage', handleStorageChange);

        // Additional check a bit after component mounts (in case PyQt sets flags right after our initial check)
        const delayedCheck = setTimeout(() => {
            const persistentAuth = localStorage.getItem('hackerRankAuth');
            const sessionAuth = sessionStorage.getItem('hackerRankAuthInProgress');

            console.log('Delayed auth check - localStorage:', persistentAuth, 'sessionStorage:', sessionAuth);

            const isAuthenticated = persistentAuth === 'true' || sessionAuth === 'true';
            if (isAuthenticated && !isHackerRankAuthenticated) {
                console.log('Detected auth flags set after initial check, updating state');
                setIsHackerRankAuthenticated(true);
                if (!accessControl) {
                    loadAssessmentData();
                }
            }
        }, 500);  // Check after 500ms

        // Cleanup
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearTimeout(delayedCheck);
        };
    }, [isOpen, isHackerRankAuthenticated, accessControl]);

    if (!isOpen) return null;

    // ── SEED-SEB verification temporarily disabled for browser UI testing ──
    // To re-enable: uncomment the block below before production deployment
    /*
    if (!isRunningInPyQt()) {
        return (
            <div className="assessment-modal">
                <div className="assessment-modal-content">
                    <div className="assessment-modal-header">
                        <h3>Assessment Platform</h3>
                        <button className="modal-close" onClick={onClose}>
                            <FaTimes />
                        </button>
                    </div>
                    <div className="platform-message">
                        <p>The Assessment platform is exclusively available on our Windows desktop app for an optimal learning experience.</p>
                        <div className="download-prompt">
                            <p>Download our Windows app to access:</p>
                            <ul>
                                <li>Interactive coding assessments</li>
                                <li>Real-time feedback and evaluation</li>
                                <li>Progress tracking and analytics</li>
                                <li>Offline access to learning materials</li>
                            </ul>
                            <button className="download-btn" onClick={() => window.open('https://github.com/seeditDev/Seed-IT-App/releases/tag/SEEDITAPP', '_blank')}>
                                <FaDownload /> Download Windows App
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    */


    return (
        <div className="assessment-modal">
            <style>{loadingSpinnerStyles}</style>
            <div className="assessment-modal-content">
                <div className="assessment-modal-header">
                    <h3>Assessment Platform</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>

                <div className="assessment-modal-body">
                    {!isAssessmentStarted && !accessControl ? (
                        <div className="assessment-start">
                            {/* Display status message based on auth state */}
                            {isHackerRankAuthenticated ?
                                <h3>You're connected to HackerRank!</h3> :
                                <h3>Connect to HackerRank to start an assessment</h3>
                            }

                            {/* Display status info */}
                            <p style={{
                                marginBottom: '20px',
                                padding: '10px',
                                backgroundColor: isHackerRankAuthenticated ? '#e8f5e9' : '#fff3e0',
                                borderRadius: '4px',
                                border: `1px solid ${isHackerRankAuthenticated ? '#a5d6a7' : '#ffe0b2'}`
                            }}>
                                {isHackerRankAuthenticated ?
                                    'You can now access assessments. Click the button below to load assessment data.' :
                                    'You need to connect to HackerRank before you can access assessments. Click the button below to continue.'
                                }
                            </p>

                            {/* Error message if any */}
                            {error && (
                                <div className="error-message">
                                    <p>{error}</p>
                                </div>
                            )}

                            {/* Button changes based on auth state */}
                            <button
                                className="start-btn"
                                onClick={startAssessment}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <div className="loading-spinner"></div>
                                        <span>{isHackerRankAuthenticated ? 'Loading Data...' : 'Connecting to HackerRank...'}</span>
                                    </>
                                ) : isHackerRankAuthenticated ? (
                                    'Load Assessment Data'
                                ) : (
                                    'Connect to HackerRank'
                                )}
                            </button>

                            {/* Note about authentication process */}
                            <div style={{ marginTop: '20px', fontSize: '0.9em', color: '#666' }}>
                                <p>
                                    {isHackerRankAuthenticated ?
                                        'Your HackerRank login credentials are secure and encrypted.' :
                                        'This will connect you to HackerRank for authentication. Your login credentials are secure and encrypted.'
                                    }
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="assessment-content">
                            <div className="assessment-header">
                                <h3>Assessment in Progress</h3>
                                {/* End Assessment button removed as requested */}
                            </div>

                            {accessControl ? (
                                <div className="side-by-side-selection">
                                    <div className="selection-container">
                                        <div className="selection-box">
                                            <h3>Sections</h3>
                                            <ul className="selection-list" id="sectionList">
                                                {getSectionOptions().map(option => (
                                                    <li
                                                        key={option.value}
                                                        className={selectedSection === option.value ? "section-selected" : ""}
                                                        onClick={() => {
                                                            setSelectedSection(option.value);
                                                            setSelectedTitle('');
                                                            setSelectedModule(null);
                                                        }}
                                                    >
                                                        {option.label}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="selection-box">
                                            <h3>Modules</h3>
                                            {selectedSection && (
                                                <>
                                                    <input
                                                        type="text"
                                                        className="search-box"
                                                        placeholder="Search modules..."
                                                        onChange={(e) => {
                                                            setModuleSearchTerm(e.target.value.toLowerCase());
                                                        }}
                                                        id="moduleSearch"
                                                    />
                                                    <ul className="selection-list" id="modulesList">
                                                        {getTitleOptions()
                                                            .filter(option =>
                                                                option.label.toLowerCase().includes(moduleSearchTerm)
                                                            )
                                                            .map(option => (
                                                                <li
                                                                    key={option.value}
                                                                    className={selectedTitle === option.value ? "module-selected" : ""}
                                                                    onClick={() => {
                                                                        setSelectedTitle(option.value);
                                                                        const moduleInfo = accessControl.courses[selectedSection].modules[option.value];
                                                                        setSelectedModule(moduleInfo);
                                                                        // Reset passkey state when switching modules
                                                                        setPasskey('');
                                                                        setIsPasskeyValidated(false);
                                                                        setIsValidatingPasskey(false);
                                                                        setScheduleRefreshKey(prev => prev + 1);
                                                                    }}
                                                                >
                                                                    <div className="module-item">
                                                                        <span className="module-name">{option.label}</span>
                                                                        {option.moduleData?.schedule && (
                                                                            <span className="schedule-indicator" title={option.scheduleInfo}>
                                                                                
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        {getTitleOptions().filter(option =>
                                                            option.label.toLowerCase().includes(moduleSearchTerm)
                                                        ).length === 0 && (
                                                                <li className="no-results">No matching modules found</li>
                                                            )}
                                                    </ul>
                                                </>
                                            )}
                                            {!selectedSection && (
                                                <div className="no-selection-message">
                                                    Please select a section first
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="button-container">
                                        {selectedModule && isAssessmentModule() && (() => {
                                            const scheduleAccess = checkScheduleAccess(selectedModule);
                                            const isBeforeWindow = !scheduleAccess.allowed && /starts|only available|available daily|available on/.test(scheduleAccess.reason ?? '');

                                            if (isBeforeWindow) {
                                                return (
                                                    <div className="passkey-section">
                                                        <div className="passkey-message passkey-error">
                                                            {scheduleAccess.reason}
                                                            <button
                                                                className="validate-btn"
                                                                style={{ marginLeft: 8 }}
                                                                onClick={() => setScheduleRefreshKey(prev => prev + 1)}
                                                            >
                                                                Refresh
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="passkey-section">
                                                    <div className="passkey-input-container">
                                                        <input
                                                            type="password"
                                                            className="passkey-input"
                                                            placeholder="Enter passkey"
                                                            value={passkey}
                                                            onChange={(e) => setPasskey(e.target.value)}
                                                            disabled={isPasskeyValidated}
                                                        />
                                                        <button
                                                            className={`validate-btn ${isValidatingPasskey ? 'loading' : ''} ${isPasskeyValidated ? 'validated' : ''}`}
                                                            onClick={validatePasskey}
                                                            disabled={isValidatingPasskey || isPasskeyValidated}
                                                        >
                                                            {isValidatingPasskey ? (
                                                                <>
                                                                    <div className="loading-spinner"></div>
                                                                    Validating...
                                                                </>
                                                            ) : isPasskeyValidated ? (
                                                                ' Validated'
                                                            ) : (
                                                                'Validate'
                                                            )}
                                                        </button>
                                                    </div>
                                                    {(isPasskeyValidated || error) && (
                                                        <div className={`passkey-message ${isPasskeyValidated ? 'passkey-success' : 'passkey-error'}`}>
                                                            {isPasskeyValidated ? ' Passkey validated successfully' : error}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Only show Begin button for non-assessment modules OR after successful validation & within schedule */}
                                        {selectedModule && (!isAssessmentModule() || (isPasskeyValidated && checkScheduleAccess(selectedModule).allowed)) && (
                                            <button
                                                className={`begin-btn ${isBeginLoading ? 'loading' : ''}`}
                                                onClick={handleBegin}
                                                disabled={isBeginLoading}
                                            >
                                                {isBeginLoading ? (
                                                    <>
                                                        <div className="loading-spinner"></div>
                                                        Connecting...
                                                    </>
                                                ) : (
                                                    'Begin'
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="loading-container" style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: '150px',
                                    flexDirection: 'column'
                                }}>
                                    <div className="loading-spinner" style={{
                                        width: '40px',
                                        height: '40px',
                                        border: '5px solid rgba(0,0,0,0.1)',
                                        borderRadius: '50%',
                                        borderTopColor: '#4CAF50',
                                        animation: 'spin 1s ease-in-out infinite',
                                        marginBottom: '15px'
                                    }}></div>
                                    <p>Loading assessment options...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Iframe Modal */}
            {showIframeModal && selectedModule && (
                <div className="iframe-modal">
                    <div className="iframe-modal-content">
                        <div className="iframe-modal-header">
                            <h3>{selectedModule.name}</h3>
                            <button className="modal-close" onClick={() => setShowIframeModal(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="iframe-modal-body">
                            <iframe
                                src={selectedModule.url}
                                title={selectedModule.name}
                                width="100%"
                                height="600px"
                                frameBorder="0"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Assessment; 