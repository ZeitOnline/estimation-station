export function setCookie(name: string, value: string, days = 365) {
	const expires = new Date();
	expires.setDate(expires.getDate() + days);
	document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`;
}

export function getCookie(name: string): string | undefined {
	const cookies = document.cookie.split('; ').reduce(
		(acc, current) => {
			const [key, value] = current.split('=');
			acc[key] = value;
			return acc;
		},
		{} as Record<string, string>
	);
	return cookies[name];
}
