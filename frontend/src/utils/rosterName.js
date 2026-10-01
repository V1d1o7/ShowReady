// "Preferred name wins, legal name is the fallback" — mirrors app/services/roster_shared.py.
// Preferred fields are never auto-copied from the legal name at write time, so the fallback
// is always computed here, at render time. Pass whichever object actually holds the
// first_name/preferred_first_name keys for that call site (e.g. getDisplayName(crewMember.roster)
// when the roster is nested, getDisplayName(member) when it's flat).

export const getDisplayName = (member) => {
    if (!member) return '';
    const first = member.preferred_first_name || member.first_name || '';
    const last = member.preferred_last_name || member.last_name || '';
    return `${first} ${last}`.trim();
};

export const getLegalName = (member) => `${member?.first_name || ''} ${member?.last_name || ''}`.trim();

export const hasPreferredName = (member) =>
    !!((member?.preferred_first_name || '').trim() || (member?.preferred_last_name || '').trim());
