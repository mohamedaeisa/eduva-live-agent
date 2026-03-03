
import { parentShared } from './shared';
import { parentCompass } from './compass';
import { parentDetails } from './details';
import { parentReport } from './report';
import { parentLegacy } from './legacy';

export const parent = {
    ...parentShared, // signals, status, footer
    compass: parentCompass,
    details: parentDetails,
    report: parentReport,
    ...parentLegacy // legacy flat keys (parentHub, selectStudent, etc) mixed in at root level of parent object? 
    // Wait, the legacy keys were at root in TRANSLATIONS.English. 
    // If I put them here, they will be accessible as t.parent.parentHub
    // But in the monolith they are t.parentHub.
    // The user's goal is to modularize.
    // I need to see where they go in the final index.
};

// Export individual parts for the main registry to compose
export { parentShared, parentCompass, parentDetails, parentReport, parentLegacy };
