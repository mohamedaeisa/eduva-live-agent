
import React from 'react';
import StudentGuidanceRadar from './StudentGuidanceRadar';
import { Language } from '../../../types';

interface Props {
    expanded: boolean;
    studentId: string;
    appLanguage: Language;
    subjects?: string[]; // Optional to avoid strict breakage
    onClose: () => void;
}

const HomeRadarContainer: React.FC<Props> = ({ expanded, studentId, appLanguage, subjects, onClose }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (expanded && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded, onClose]);

    return (
        <div
            ref={containerRef}
            className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${expanded ? 'max-h-[800px] opacity-100 mb-6' : 'max-h-0 opacity-0 mb-0'
                }`}
        >
            <div className="pt-4 pb-2"> {/* Internal padding for spacing */}
                <StudentGuidanceRadar studentId={studentId} appLanguage={appLanguage} subjects={subjects} onClose={onClose} />
            </div>
        </div>
    );
};

export default HomeRadarContainer;
