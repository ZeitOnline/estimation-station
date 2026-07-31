export const load = async ({ cookies }) => {
	const theme = (cookies.get('theme') as Theme | undefined) ?? 'system';
	return { theme };
};
