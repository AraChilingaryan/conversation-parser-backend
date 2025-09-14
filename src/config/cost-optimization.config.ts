// src/config/cost-optimization.config.ts

/**
 * Cost optimization configuration for Google Speech-to-Text API
 */

export interface CostOptimizationTier {
    name: string;
    description: string;
    maxSpeakers: number;
    useEnhanced: boolean;
    enableWordTimeOffsets: boolean;
    model: string;
    enableDataLogging: boolean;
    estimatedCostMultiplier: number; // Relative to base cost
}

export const COST_OPTIMIZATION_TIERS: Record<string, CostOptimizationTier> = {
    BUDGET: {
        name: 'Budget',
        description: 'Maximum cost savings with acceptable quality',
        maxSpeakers: 2,
        useEnhanced: false,
        enableWordTimeOffsets: false,
        model: 'default',
        enableDataLogging: true,
        estimatedCostMultiplier: 1.0 // Base cost only
    },
    BALANCED: {
        name: 'Balanced',
        description: 'Good balance of cost and features',
        maxSpeakers: 4,
        useEnhanced: false,
        enableWordTimeOffsets: false,
        model: 'default',
        enableDataLogging: true,
        estimatedCostMultiplier: 1.6 // +60% for speaker diarization
    },
    QUALITY: {
        name: 'Quality',
        description: 'Better accuracy with moderate cost increase',
        maxSpeakers: 6,
        useEnhanced: true,
        enableWordTimeOffsets: false,
        model: 'latest_long',
        enableDataLogging: true,
        estimatedCostMultiplier: 2.1 // +60% diarization + 25% enhanced + 25% premium model
    },
    PREMIUM: {
        name: 'Premium',
        description: 'Best features available (highest cost)',
        maxSpeakers: 8,
        useEnhanced: true,
        enableWordTimeOffsets: true,
        model: 'latest_long',
        enableDataLogging: false, // Better privacy but higher cost
        estimatedCostMultiplier: 3.2 // All premium features + no data logging
    }
};

export const DEFAULT_OPTIMIZATION_SETTINGS = {
    // Cost-effective defaults
    tier: 'BALANCED' as keyof typeof COST_OPTIMIZATION_TIERS,

    // Audio preprocessing for cost savings
    enableSilenceRemoval: true,
    maxAudioDuration: 3600, // 1 hour limit
    targetSampleRate: 16000, // Optimal for speech recognition

    // Feature toggles
    enableBatchProcessing: true,
    enableCostEstimation: true,
    enableCostAlerts: true,

    // Cost limits
    maxCostPerRequest: 5.00, // $5 USD limit
    monthlyCostLimit: 100.00, // $100 USD monthly limit

    // Monitoring
    trackCostMetrics: true,
    alertThreshold: 0.80 // Alert at 80% of limits
};

export const PRICING_CONSTANTS = {
    // Base pricing per minute (USD)
    BASE_RATE_WITH_LOGGING: 0.016,
    BASE_RATE_WITHOUT_LOGGING: 0.024,

    // Premium feature multipliers
    SPEAKER_DIARIZATION_PREMIUM: 0.60, // 60% additional cost
    ENHANCED_MODELS_PREMIUM: 0.25,     // 25% additional cost
    WORD_TIMESTAMPS_PREMIUM: 0.10,     // 10% additional cost
    PREMIUM_MODEL_PREMIUM: 0.25,       // 25% additional cost for latest_long

    // Free tier limits
    FREE_MINUTES_PER_MONTH: 60,

    // Volume discounts (Google's published tiers)
    VOLUME_DISCOUNTS: [
        { minMinutes: 0, maxMinutes: 500000, rate: 1.0 },
        { minMinutes: 500000, maxMinutes: 1000000, rate: 0.625 }, // 37.5% discount
        { minMinutes: 1000000, maxMinutes: 2000000, rate: 0.5 },   // 50% discount
        { minMinutes: 2000000, maxMinutes: Infinity, rate: 0.25 }   // 75% discount
    ]
};

export class CostCalculator {
    /**
     * Calculate estimated cost for a speech-to-text request
     */
    static calculateCost(
        durationMinutes: number,
        tier: keyof typeof COST_OPTIMIZATION_TIERS,
        monthlyUsage: number = 0
    ): {
        baseCost: number;
        premiumCost: number;
        totalCost: number;
        breakdown: string[];
        tier: CostOptimizationTier;
    } {
        const tierConfig = COST_OPTIMIZATION_TIERS[tier];
        const baseRate = tierConfig.enableDataLogging
            ? PRICING_CONSTANTS.BASE_RATE_WITH_LOGGING
            : PRICING_CONSTANTS.BASE_RATE_WITHOUT_LOGGING;

        // Apply volume discount
        const effectiveRate = this.getVolumeDiscountedRate(baseRate, monthlyUsage);
        const baseCost = durationMinutes * effectiveRate;

        let premiumCost = 0;
        const breakdown: string[] = [`Base: ${durationMinutes.toFixed(2)} min × $${effectiveRate.toFixed(4)} = $${baseCost.toFixed(4)}`];

        // Calculate premium features
        if (tierConfig.maxSpeakers > 2) {
            const diarizationCost = baseCost * PRICING_CONSTANTS.SPEAKER_DIARIZATION_PREMIUM;
            premiumCost += diarizationCost;
            breakdown.push(`Speaker diarization (${tierConfig.maxSpeakers} speakers): +$${diarizationCost.toFixed(4)}`);
        }

        if (tierConfig.useEnhanced) {
            const enhancedCost = baseCost * PRICING_CONSTANTS.ENHANCED_MODELS_PREMIUM;
            premiumCost += enhancedCost;
            breakdown.push(`Enhanced models: +$${enhancedCost.toFixed(4)}`);
        }

        if (tierConfig.enableWordTimeOffsets) {
            const timestampCost = baseCost * PRICING_CONSTANTS.WORD_TIMESTAMPS_PREMIUM;
            premiumCost += timestampCost;
            breakdown.push(`Word timestamps: +$${timestampCost.toFixed(4)}`);
        }

        if (tierConfig.model === 'latest_long') {
            const premiumModelCost = baseCost * PRICING_CONSTANTS.PREMIUM_MODEL_PREMIUM;
            premiumCost += premiumModelCost;
            breakdown.push(`Premium model: +$${premiumModelCost.toFixed(4)}`);
        }

        const totalCost = baseCost + premiumCost;

        return {
            baseCost: Math.round(baseCost * 10000) / 10000,
            premiumCost: Math.round(premiumCost * 10000) / 10000,
            totalCost: Math.round(totalCost * 10000) / 10000,
            breakdown,
            tier: tierConfig
        };
    }

    /**
     * Get volume-discounted rate based on monthly usage
     */
    private static getVolumeDiscountedRate(baseRate: number, monthlyUsage: number): number {
        const discount = PRICING_CONSTANTS.VOLUME_DISCOUNTS.find(
            tier => monthlyUsage >= tier.minMinutes && monthlyUsage < tier.maxMinutes
        );
        return baseRate * (discount?.rate || 1.0);
    }

    /**
     * Compare costs across different tiers
     */
    static compareTiers(durationMinutes: number, monthlyUsage: number = 0): {
        tier: string;
        cost: number;
        features: string[];
        savings: number;
    }[] {
        const premiumCost = this.calculateCost(durationMinutes, 'PREMIUM', monthlyUsage).totalCost;

        return Object.keys(COST_OPTIMIZATION_TIERS).map(tier => {
            const calculation = this.calculateCost(durationMinutes, tier as any, monthlyUsage);
            const tierConfig = COST_OPTIMIZATION_TIERS[tier];

            const features: string[] = [];
            if (tierConfig.maxSpeakers > 2) features.push(`${tierConfig.maxSpeakers} speakers`);
            if (tierConfig.useEnhanced) features.push('Enhanced models');
            if (tierConfig.enableWordTimeOffsets) features.push('Word timestamps');
            if (tierConfig.model === 'latest_long') features.push('Premium model');
            if (tierConfig.enableDataLogging) features.push('Data logging (cheaper)');

            return {
                tier,
                cost: calculation.totalCost,
                features,
                savings: Math.round((premiumCost - calculation.totalCost) * 100) / 100
            };
        });
    }

    /**
     * Recommend optimal tier based on requirements
     */
    static recommendTier(requirements: {
        maxBudget?: number;
        minSpeakers?: number;
        accuracyPriority?: 'low' | 'medium' | 'high';
        privacyRequired?: boolean;
    }): keyof typeof COST_OPTIMIZATION_TIERS {
        const { maxBudget, minSpeakers = 2, accuracyPriority = 'medium', privacyRequired = false } = requirements;

        // Filter tiers based on hard requirements
        let availableTiers = Object.entries(COST_OPTIMIZATION_TIERS).filter(([_, config]) => {
            if (minSpeakers > config.maxSpeakers) return false;
            if (privacyRequired && config.enableDataLogging) return false;
            return true;
        });

        if (availableTiers.length === 0) {
            throw new Error('No tier matches the specified requirements');
        }

        // Sort by accuracy priority and cost
        availableTiers.sort(([_, a], [__, b]) => {
            if (accuracyPriority === 'high') {
                // Prefer quality, then cost
                return b.estimatedCostMultiplier - a.estimatedCostMultiplier;
            } else if (accuracyPriority === 'low') {
                // Prefer cost, then basic features
                return a.estimatedCostMultiplier - b.estimatedCostMultiplier;
            } else {
                // Balanced approach - prefer middle tiers
                const aDistance = Math.abs(a.estimatedCostMultiplier - 1.6);
                const bDistance = Math.abs(b.estimatedCostMultiplier - 1.6);
                return aDistance - bDistance;
            }
        });

        // Apply budget constraint if specified
        if (maxBudget) {
            const feasibleTiers = availableTiers.filter(([tier, _]) => {
                // Estimate for 10 minutes as baseline
                const cost = this.calculateCost(10, tier as any).totalCost;
                return cost <= maxBudget;
            });

            if (feasibleTiers.length > 0) {
                availableTiers = feasibleTiers;
            }
        }

        return availableTiers[0][0] as keyof typeof COST_OPTIMIZATION_TIERS;
    }

    /**
     * Estimate monthly cost based on usage patterns
     */
    static estimateMonthlyCost(
        averageCallsPerDay: number,
        averageDurationMinutes: number,
        tier: keyof typeof COST_OPTIMIZATION_TIERS
    ): {
        dailyCost: number;
        weeklyCost: number;
        monthlyCost: number;
        yearlyProjection: number;
        freeMinutesUsed: number;
        paidMinutes: number;
    } {
        const totalMonthlyMinutes = averageCallsPerDay * averageDurationMinutes * 30;
        const freeMinutesUsed = Math.min(totalMonthlyMinutes, PRICING_CONSTANTS.FREE_MINUTES_PER_MONTH);
        const paidMinutes = Math.max(0, totalMonthlyMinutes - PRICING_CONSTANTS.FREE_MINUTES_PER_MONTH);

        const paidCost = paidMinutes > 0 ? this.calculateCost(paidMinutes, tier, totalMonthlyMinutes).totalCost : 0;

        const dailyCost = paidCost / 30;
        const weeklyCost = paidCost / 4.33; // Average weeks per month

        return {
            dailyCost: Math.round(dailyCost * 100) / 100,
            weeklyCost: Math.round(weeklyCost * 100) / 100,
            monthlyCost: Math.round(paidCost * 100) / 100,
            yearlyProjection: Math.round(paidCost * 12 * 100) / 100,
            freeMinutesUsed: Math.round(freeMinutesUsed * 100) / 100,
            paidMinutes: Math.round(paidMinutes * 100) / 100
        };
    }
}

/**
 * Cost monitoring and alerting service
 */
export class CostMonitor {
    private static monthlyUsage = 0;
    private static monthlyCost = 0;
    private static lastResetDate = new Date();

    /**
     * Track usage and cost for monitoring
     */
    static trackUsage(minutes: number, cost: number): void {
        // Reset monthly counters if needed
        const now = new Date();
        if (now.getMonth() !== this.lastResetDate.getMonth() ||
            now.getFullYear() !== this.lastResetDate.getFullYear()) {
            this.monthlyUsage = 0;
            this.monthlyCost = 0;
            this.lastResetDate = now;
        }

        this.monthlyUsage += minutes;
        this.monthlyCost += cost;
    }

    /**
     * Check if cost limits are approaching
     */
    static checkCostLimits(): {
        withinLimits: boolean;
        warnings: string[];
        monthlyUsage: number;
        monthlyCost: number;
        percentageUsed: number;
    } {
        const settings = DEFAULT_OPTIMIZATION_SETTINGS;
        const percentageUsed = (this.monthlyCost / settings.monthlyCostLimit) * 100;
        const warnings: string[] = [];
        let withinLimits = true;

        if (percentageUsed >= settings.alertThreshold * 100) {
            warnings.push(`Monthly cost is at ${percentageUsed.toFixed(1)}% of limit (${this.monthlyCost.toFixed(2)}/${settings.monthlyCostLimit})`);
        }

        if (this.monthlyCost >= settings.monthlyCostLimit) {
            warnings.push(`Monthly cost limit exceeded: ${this.monthlyCost.toFixed(2)}`);
            withinLimits = false;
        }

        return {
            withinLimits,
            warnings,
            monthlyUsage: Math.round(this.monthlyUsage * 100) / 100,
            monthlyCost: Math.round(this.monthlyCost * 100) / 100,
            percentageUsed: Math.round(percentageUsed * 10) / 10
        };
    }

    /**
     * Get optimization recommendations
     */
    static getOptimizationRecommendations(currentTier: keyof typeof COST_OPTIMIZATION_TIERS): string[] {
        const recommendations: string[] = [];
        const currentConfig = COST_OPTIMIZATION_TIERS[currentTier];

        if (this.monthlyCost > DEFAULT_OPTIMIZATION_SETTINGS.monthlyCostLimit * 0.5) {
            if (currentConfig.useEnhanced) {
                recommendations.push('Consider disabling enhanced models to reduce costs by ~25%');
            }

            if (currentConfig.maxSpeakers > 4) {
                recommendations.push('Reduce max speakers to 4 or fewer to lower diarization costs');
            }

            if (currentConfig.enableWordTimeOffsets) {
                recommendations.push('Disable word timestamps if not essential (~10% savings)');
            }

            if (!currentConfig.enableDataLogging) {
                recommendations.push('Enable data logging for 33% cost reduction (if privacy allows)');
            }
        }

        return recommendations;
    }
}

// Export helper functions for easy integration
export const CostOptimization = {
    getTier: (tierName: keyof typeof COST_OPTIMIZATION_TIERS) => COST_OPTIMIZATION_TIERS[tierName],
    calculateCost: CostCalculator.calculateCost,
    compareTiers: CostCalculator.compareTiers,
    recommendTier: CostCalculator.recommendTier,
    estimateMonthlyCost: CostCalculator.estimateMonthlyCost,
    trackUsage: CostMonitor.trackUsage,
    checkLimits: CostMonitor.checkCostLimits,
    getRecommendations: CostMonitor.getOptimizationRecommendations
};
