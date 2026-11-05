import { resolveGatePassLocation, resolveGatePassLocationFromBplId } from './gate-pass-location.options';

describe('gate-pass location resolver', () => {
  it('resolves numeric BPL ids to known dropdown values', () => {
    expect(resolveGatePassLocation('1')).toBe('DHA');
    expect(resolveGatePassLocation('2')).toBe('Johar Town');
    expect(resolveGatePassLocation('3')).toBe('MB');
    expect(resolveGatePassLocation('4')).toBe('SAM');
    expect(resolveGatePassLocation('5')).toBe('RUDA');
  });

  it('resolves branch labels independent of case and separators', () => {
    expect(resolveGatePassLocation('johar_town')).toBe('Johar Town');
    expect(resolveGatePassLocation('mb')).toBe('MB');
    expect(resolveGatePassLocation('PSH')).toBe('DHA');
    expect(resolveGatePassLocation('Head Office')).toBe('Johar Town');
    expect(resolveGatePassLocation('FSD')).toBe('MB');
  });

  it('resolves BPL ids to branch labels', () => {
    expect(resolveGatePassLocationFromBplId('1')).toBe('DHA');
    expect(resolveGatePassLocationFromBplId(2)).toBe('Johar Town');
    expect(resolveGatePassLocationFromBplId('3')).toBe('MB');
    expect(resolveGatePassLocationFromBplId('4')).toBe('SAM');
    expect(resolveGatePassLocationFromBplId('5')).toBe('RUDA');
  });
});
