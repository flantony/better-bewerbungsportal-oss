import { describe, expect, it } from 'vitest';
import { kiChatText, kiSeitenUrl } from './connection';

const GUID = '0123456789ABCDEF0123456789ABCDEF';

describe('kiSeitenUrl', () => {
  it('zeigt auf die KI-Seite der Stelle', () => {
    expect(kiSeitenUrl(GUID)).toBe(
      `https://europe-west3-better-bewerbungsportal.cloudfunctions.net/kiSeite?id=${GUID}`
    );
  });

  it('kodiert die Kennung, statt sie roh anzuhaengen', () => {
    expect(kiSeitenUrl('a&b=c')).toContain('id=a%26b%3Dc');
  });
});

describe('kiChatText', () => {
  it('ist eine Bitte des Bewerbers mit dem Link am Ende', () => {
    const text = kiChatText(GUID);
    expect(text.startsWith('Ich möchte mich auf diese Stelle bei der Bundeswehr bewerben.')).toBe(true);
    expect(text.endsWith(kiSeitenUrl(GUID))).toBe(true);
  });
});
