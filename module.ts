import App from './App';

export const AiPrivateTutorModule = {
    id: 'ai-private-tutor',

    menu: {
        key: 'my-private-teacher',
        label: 'My Private Teacher',
        icon: '🧠', // Using a string for now, will map to icon component in Nav
        order: 3,
    },

    routes: [
        {
            path: '/my-private-teacher',
            component: App,
            auth: true,
            permissions: ['PRIVATE_TUTOR_ACCESS'],
        },
    ],

    permissions: [
        'PRIVATE_TUTOR_ACCESS',
        'PRIVATE_TUTOR_VOICE',
        'PRIVATE_TUTOR_SCREEN',
    ],

    init({ auth, telemetry, api }: any) {
        if (telemetry && telemetry.register) {
            telemetry.register('ai-private-tutor');
        }
        if (api && api.register) {
            api.register('/ai-private-tutor');
        }
    },
};
