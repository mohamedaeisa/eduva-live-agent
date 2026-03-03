import { IngestionConfig, ExtractionMode } from '../../types/ingestion';
import { logger } from '../../utils/logger';

export class IngestionValidationError extends Error {
    constructor(message: string) {
        super(`[IngestionValidationError] ${message}`);
        this.name = 'IngestionValidationError';
    }
}

export function validateIngestionConfig(config: IngestionConfig): void {
    // 1. Basic Schema Validation
    if (!config.documentId) {
        throw new IngestionValidationError("Missing required field: documentId");
    }
    if (!config.subject) {
        throw new IngestionValidationError("Missing required field: subject");
    }
    if (!config.language) {
        throw new IngestionValidationError("Missing required field: language");
    }

    // 2. Mode Specific Validation
    if (config.extractionMode === ExtractionMode.CURRICULUM) {
        if (!config.studentProfileId) {
            throw new IngestionValidationError("Curriculum Mode requires a valid 'studentProfileId'.");
        }
    }

    // 3. Enum Safety (Runtime check if data comes from untyped sources)
    if (!Object.values(ExtractionMode).includes(config.extractionMode)) {
        throw new IngestionValidationError(`Invalid extractionMode: ${config.extractionMode}`);
    }

    logger.ingestion(`[VALIDATOR] Config validated via ${config.extractionMode} strategy.`);
}
