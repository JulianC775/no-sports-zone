export class SportsDetector {
  private sportsKeywords: Set<string>;

  constructor() {
    this.sportsKeywords = new Set([
      // General sports terms
      'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis',
      'golf', 'cricket', 'rugby', 'volleyball', 'boxing', 'wrestling',
      'mma', 'ufc', 'nfl', 'nba', 'mlb', 'nhl', 'fifa',

      // Common sports phrases
      'game', 'match', 'tournament', 'championship', 'playoffs', 'season',
      'score', 'team', 'player', 'coach', 'referee', 'stadium',
      'touchdown', 'goal', 'home run', 'slam dunk', 'hat trick',

      // Popular teams (examples - add more as needed)
      'lakers', 'yankees', 'cowboys', 'patriots', 'warriors', 'celtics',
      'red sox', 'manchester united', 'barcelona', 'real madrid',

      // Athletes (examples)
      'lebron', 'brady', 'messi', 'ronaldo', 'mahomes', 'curry',

      // Sports events
      'super bowl', 'world cup', 'olympics', 'world series', 'finals',
      'draft', 'espn', 'sports center',

      // American Football Terms
      'quarterback', 'qb', 'running back', 'rb', 'wide receiver', 'wr',
      'tight end', 'te', 'offensive line', 'defensive line', 'linebacker',
      'cornerback', 'cb', 'safety', 'free safety', 'strong safety',
      'kickoff', 'punt', 'field goal', 'extra point', 'two point conversion',
      'first down', 'fourth down', 'red zone', 'end zone', 'line of scrimmage',
      'snap', 'blitz', 'sack', 'interception', 'fumble', 'tackle',
      'pass', 'rush', 'reception', 'yard', 'yards', 'offensive coordinator',
      'defensive coordinator', 'head coach', 'play action', 'screen pass',
      'hail mary', 'onside kick', 'touchback', 'holding', 'offsides',
      'pass interference', 'roughing the passer', 'helmet to helmet',
      'division', 'conference', 'afc', 'nfc', 'wild card', 'pro bowl',

      // Denver Broncos Players (current and recent key players)
      'russell wilson', 'russ wilson', 'bo nix', 'jarrett stidham',
      'javonte williams', 'jaleel mclaughlin', 'samaje perine',
      'courtland sutton', 'jerry jeudy', 'tim patrick', 'marvin mims',
      'adam trautman', 'greg dulcich', 'garett bolles', 'mike mcglinchey',
      'lloyd cushenberry', 'quinn meinerz', 'ben powers',
      'patrick surtain', 'pat surtain', 'patrick surtain ii',
      'justin simmons', 'kareem jackson', 'josey jewell', 'alex singleton',
      'jonathon cooper', 'baron browning', 'nik bonitto', 'dre mont jones',
      'zach allen', 'riley moss', 'caden sterns', 'p j locke',
      'sean payton', 'vance joseph',

      // Broncos legends
      'john elway', 'peyton manning', 'von miller', 'demaryius thomas',
      'terrell davis', 'shannon sharpe', 'steve atwater', 'champ bailey',
      'rod smith', 'clinton portis', 'bradley chubb',

      // Seattle Seahawks Players (current and recent key players)
      'geno smith', 'drew lock', 'kenneth walker', 'kenneth walker iii',
      'zach charbonnet', 'dk metcalf', 'tyler lockett', 'jaxon smith njigba',
      'noah fant', 'will dissly', 'colby parkinson', 'charles cross',
      'abraham lucas', 'damien lewis', 'evan brown', 'phil haynes',
      'devon witherspoon', 'tariq woolen', 'riq woolen', 'coby bryant',
      'jamal adams', 'julian love', 'quandre diggs', 'bobby wagner',
      'jordyn brooks', 'devin bush', 'boye mafe', 'dre mont jones',
      'jarran reed', 'leonard williams', 'derick hall', 'michael jackson',
      'mike macdonald', 'ryan grubb',

      // Seahawks legends
      'russell wilson', 'marshawn lynch', 'beast mode', 'richard sherman',
      'kam chancellor', 'earl thomas', 'doug baldwin', 'steve largent',
      'walter jones', 'cortez kennedy', 'shaun alexander', 'matt hasselbeck',
      'pete carroll', 'legion of boom', 'sea hawks', '12th man',

      // NFL Teams
      'broncos', 'seahawks', 'raiders', 'chargers', 'chiefs',
      'ravens', 'steelers', 'browns', 'bengals', 'texans',
      'colts', 'jaguars', 'titans', 'bills', 'dolphins',
      'jets', 'eagles', 'giants', 'commanders', 'washington',
      'packers', 'bears', 'lions', 'vikings', 'falcons',
      'panthers', 'saints', 'buccaneers', 'bucs', 'cardinals',
      '49ers', 'niners', 'rams', 'arizona', 'san francisco'
    ]);
  }

  detectSports(text: string): { detected: boolean; keywords: string[] } {
    const lowerText = text.toLowerCase();
    const detectedKeywords: string[] = [];

    for (const keyword of this.sportsKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerText)) {
        detectedKeywords.push(keyword);
      }
    }

    return {
      detected: detectedKeywords.length > 0,
      keywords: detectedKeywords
    };
  }

  addKeyword(keyword: string): void {
    this.sportsKeywords.add(keyword.toLowerCase());
  }

  removeKeyword(keyword: string): void {
    this.sportsKeywords.delete(keyword.toLowerCase());
  }

  getKeywords(): string[] {
    return Array.from(this.sportsKeywords);
  }
}
