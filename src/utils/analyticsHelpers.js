/**
 * ANALYTICS HELPER FUNCTIONS
 * Mathematical and statistical utilities for advanced analytics
 */

/**
 * Calculate trend analysis from time series data
 * @param {Array} data - Array of time series data points
 * @returns {Object} Trend analysis results
 */
const calculateTrendAnalysis = (data) => {
    if (!data || data.length < 2) {
        return {
            trend_direction: 'insufficient_data',
            trend_strength: 0,
            slope: 0,
            r_squared: 0
        };
    }

    // Extract values for linear regression
    const values = data.map(d => parseFloat(d.avg_score || 0));
    const n = values.length;
    
    // Calculate linear regression
    const xValues = Array.from({ length: n }, (_, i) => i);
    const xSum = xValues.reduce((a, b) => a + b, 0);
    const ySum = values.reduce((a, b) => a + b, 0);
    const xySum = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
    const x2Sum = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    
    // Calculate R-squared
    const yMean = ySum / n;
    const ssTotal = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const ssResidual = values.reduce((sum, y, i) => {
        const predicted = slope * i + intercept;
        return sum + Math.pow(y - predicted, 2);
    }, 0);
    
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    
    // Determine trend direction and strength
    let trendDirection = 'stable';
    let trendStrength = Math.abs(slope);
    
    if (slope > 0.1) trendDirection = 'improving';
    else if (slope < -0.1) trendDirection = 'declining';
    
    return {
        trend_direction: trendDirection,
        trend_strength: trendStrength.toFixed(4),
        slope: slope.toFixed(4),
        r_squared: rSquared.toFixed(4),
        confidence: rSquared > 0.7 ? 'high' : rSquared > 0.4 ? 'medium' : 'low'
    };
};

/**
 * Create histogram from data array
 * @param {Array} data - Array of numeric values
 * @param {number} bins - Number of bins for histogram
 * @returns {Array} Histogram bins with counts
 */
const createHistogram = (data, bins = 10) => {
    if (!data || data.length === 0) {
        return [];
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    
    const histogram = Array.from({ length: bins }, (_, i) => ({
        bin_start: min + i * binWidth,
        bin_end: min + (i + 1) * binWidth,
        count: 0,
        percentage: 0
    }));
    
    // Count values in each bin
    data.forEach(value => {
        let binIndex = Math.floor((value - min) / binWidth);
        if (binIndex >= bins) binIndex = bins - 1; // Handle edge case for max value
        if (binIndex >= 0) histogram[binIndex].count++;
    });
    
    // Calculate percentages
    const total = data.length;
    histogram.forEach(bin => {
        bin.percentage = total > 0 ? (bin.count / total * 100).toFixed(2) : 0;
    });
    
    return histogram;
};

/**
 * Calculate descriptive statistics
 * @param {Array} data - Array of numeric values
 * @returns {Object} Statistical measures
 */
const calculateDescriptiveStatistics = (data) => {
    if (!data || data.length === 0) {
        return {
            count: 0,
            mean: 0,
            median: 0,
            mode: null,
            std_dev: 0,
            variance: 0,
            min: 0,
            max: 0,
            q1: 0,
            q3: 0,
            iqr: 0,
            skewness: 0,
            kurtosis: 0
        };
    }

    const sortedData = [...data].sort((a, b) => a - b);
    const n = data.length;
    
    // Basic measures
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    
    // Median
    const median = n % 2 === 0 
        ? (sortedData[n/2 - 1] + sortedData[n/2]) / 2
        : sortedData[Math.floor(n/2)];
    
    // Mode (most frequent value)
    const frequency = {};
    data.forEach(value => {
        frequency[value] = (frequency[value] || 0) + 1;
    });
    const maxFreq = Math.max(...Object.values(frequency));
    const modes = Object.keys(frequency).filter(key => frequency[key] === maxFreq);
    const mode = modes.length === n ? null : parseFloat(modes[0]); // No mode if all values are unique
    
    // Variance and standard deviation
    const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    // Quartiles
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sortedData[q1Index];
    const q3 = sortedData[q3Index];
    const iqr = q3 - q1;
    
    // Skewness (measure of asymmetry)
    const skewness = stdDev > 0 ? 
        data.reduce((sum, value) => sum + Math.pow((value - mean) / stdDev, 3), 0) / n : 0;
    
    // Kurtosis (measure of tail heaviness)
    const kurtosis = stdDev > 0 ? 
        data.reduce((sum, value) => sum + Math.pow((value - mean) / stdDev, 4), 0) / n - 3 : 0;
    
    return {
        count: n,
        mean: mean.toFixed(2),
        median: median.toFixed(2),
        mode: mode ? mode.toFixed(2) : null,
        std_dev: stdDev.toFixed(2),
        variance: variance.toFixed(2),
        min: Math.min(...data).toFixed(2),
        max: Math.max(...data).toFixed(2),
        q1: q1.toFixed(2),
        q3: q3.toFixed(2),
        iqr: iqr.toFixed(2),
        skewness: skewness.toFixed(3),
        kurtosis: kurtosis.toFixed(3)
    };
};

/**
 * Get comparison date range based on period
 * @param {string} period - Comparison period ('previous_month', 'previous_quarter', etc.)
 * @returns {Object} Date range object
 */
const getComparisonDateRange = (period) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    
    switch (period) {
        case 'previous_week':
            start.setDate(now.getDate() - 14);
            end.setDate(now.getDate() - 7);
            break;
        case 'previous_month':
            start.setMonth(now.getMonth() - 2);
            end.setMonth(now.getMonth() - 1);
            break;
        case 'previous_quarter':
            start.setMonth(now.getMonth() - 6);
            end.setMonth(now.getMonth() - 3);
            break;
        case 'previous_year':
            start.setFullYear(now.getFullYear() - 2);
            end.setFullYear(now.getFullYear() - 1);
            break;
        default:
            return null;
    }
    
    return { start, end };
};

/**
 * Calculate correlation coefficient between two arrays
 * @param {Array} x - First array
 * @param {Array} y - Second array
 * @returns {number} Correlation coefficient (-1 to 1)
 */
const calculateCorrelation = (x, y) => {
    if (!x || !y || x.length !== y.length || x.length === 0) {
        return 0;
    }
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Detect outliers using IQR method
 * @param {Array} data - Array of numeric values
 * @returns {Object} Outlier analysis
 */
const detectOutliers = (data) => {
    if (!data || data.length < 4) {
        return {
            outliers: [],
            outlier_count: 0,
            outlier_percentage: 0,
            lower_bound: null,
            upper_bound: null
        };
    }
    
    const sortedData = [...data].sort((a, b) => a - b);
    const n = data.length;
    
    // Calculate quartiles
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sortedData[q1Index];
    const q3 = sortedData[q3Index];
    const iqr = q3 - q1;
    
    // Calculate bounds (1.5 * IQR rule)
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    // Find outliers
    const outliers = data.filter(value => value < lowerBound || value > upperBound);
    
    return {
        outliers,
        outlier_count: outliers.length,
        outlier_percentage: (outliers.length / data.length * 100).toFixed(2),
        lower_bound: lowerBound.toFixed(2),
        upper_bound: upperBound.toFixed(2)
    };
};

/**
 * Calculate moving average
 * @param {Array} data - Array of numeric values
 * @param {number} window - Window size for moving average
 * @returns {Array} Moving average values
 */
const calculateMovingAverage = (data, window = 3) => {
    if (!data || data.length < window) {
        return data || [];
    }
    
    const movingAvg = [];
    for (let i = window - 1; i < data.length; i++) {
        const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
        movingAvg.push(sum / window);
    }
    
    return movingAvg;
};

module.exports = {
    calculateTrendAnalysis,
    createHistogram,
    calculateDescriptiveStatistics,
    getComparisonDateRange,
    calculateCorrelation,
    detectOutliers,
    calculateMovingAverage
};
