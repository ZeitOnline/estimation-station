import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime environment, exposed via `$app/env/public` and `$app/env/private`.
// None of these are `static`: they are read when the server starts, so the
// deployment can set them (e.g. PUBLIC_APP_VERSION is injected per image tag,
// see k8s/*/kustomization.yaml). Unset vars become '' — callers apply their
// own defaults with `||`, same as with the old `$env/dynamic/*` modules.
const optional = { schema: (input: string | undefined) => input ?? '' };

export const variables = defineEnvVars({
	PUBLIC_APP_VERSION: { ...optional, public: true },
	JIRA_BASE_URL: optional,
	JIRA_EMAIL: optional,
	JIRA_API_TOKEN: optional,
	JIRA_STORY_POINTS_FIELD: optional,
	JIRA_REFINED_STATUS: optional,
	JIRA_DESCRIPTION_FIELDS: optional,
	AUTH_MODE: optional,
	OIDC_ISSUER: optional,
	OIDC_JWKS_URL: optional,
	OIDC_AUDIENCE: optional,
	ALLOWED_EMAIL_DOMAINS: optional,
	ALLOWED_GROUP: optional
});
