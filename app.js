var START_DATE_TIME = '2016-11-05 12:00:00';
var TEAM_ID = 29423;
var REFRESH_RATE = 60;
var RECENT_DONATIONS = 20;
var DONATION_DURATION = 8;
var TWITCH_CHANNEL = 'knownworldunited';

var app = angular.module('app', ['ngFx', 'ngAnimate']);

app.config(['$httpProvider', function($httpProvider) {
        $httpProvider.defaults.useXDomain = true;
        delete $httpProvider.defaults.headers.common['X-Requested-With'];
    }
]);

app.controller('OverlayCtrl', function ($scope, $location, $interval, extraLife, clock) {
	
	$scope.debug = $location.search().debug || false;		
	$scope.count = $location.search().count || RECENT_DONATIONS;	
	var refreshInterval = $location.search().refresh || REFRESH_RATE;
	
	$scope.extraLife = extraLife;
	$scope.clock = clock;	

	extraLife.refresh();
	
	var refresh = $interval(function(){
		extraLife.refresh();
	}, refreshInterval * 1000);
	
	$scope.$on('$destroy', function() {
		if (refresh) {
			$interval.cancel(refresh);
			refresh = null;
		}
	});

	$scope.donate = function() {
		extraLife.simulateDonation(50, "Doug Little", "Alex Trebek", "Suck it Trebek!");
	}
});

app.controller('DashboardCtrl', function ($scope, $location, $interval, extraLife, clock, twitch) {
	
	var refreshInterval = $location.search().refresh || 60;
	
	$scope.extraLife = extraLife;
	$scope.twitch = twitch;
	$scope.clock = clock;	

	extraLife.refresh();
	twitch.refresh();
	
	var refresh = $interval(function(){
		extraLife.refresh();
		twitch.refresh();
	}, refreshInterval * 1000);
	
	$scope.$on('$destroy', function() {
		if (refresh) {
			$interval.cancel(refresh);
			refresh = null;
		}
	});
		
	$scope.donate = function() {
		extraLife.simulateDonation(50, "Doug Little", "Alex Trebek", "Suck it Trebek!");
	}
});

app.factory('clock', function ($location, $interval) {

	var start = moment($location.search().start || START_DATE_TIME, 'YYYY-MM-DD HH:mm:ss');
	var clock = { time: '' };

	$interval(function(){
		var now = moment();
		var diff = moment().diff(start);
		var hours = parseInt(diff / 3600000);
		var dur = moment.duration(diff);
		var sign = diff < 0 ? '-' : '';
		clock.time = sign + pad(hours,2) + ':' + pad(dur.minutes(),2) + ':' + pad(dur.seconds(),2);
	}, 1000);

	function pad(num, size) {
		if (num < 0) num *= -1;
		var s = num+"";
		while (s.length < size) s = "0" + s;
		return s;
	}

	return clock;
});

app.factory('twitch', function ($http, $q, $location, $timeout, $sce) {

	var clientId = "bf57d3i9qagf8qci1l401mi2a3rol26";
	var channel = $location.search().twitch || TWITCH_CHANNEL;

	var twitch = {
		viewers: 0,
		chat: {
			url: $sce.trustAsResourceUrl("https://www.twitch.tv/" + channel + "/chat"),
			chatters: 0,
			mods: [],
			viewers: []
		},
		refresh: function() {
			return $q.all([
				refreshViewers(), 
				refreshChatters()
			]);
		}
	};

	return twitch;

	function refreshViewers() {
		return $http.get(
			'https://api.twitch.tv/kraken/streams/'+channel, 
			{headers: {'Client-ID': clientId}}
		).then(function(response) {
			twitch.viewers = response.data.stream.viewers;
		});
	}

	function refreshChatters() {
		return $http.jsonp('https://tmi.twitch.tv/group/user/'+channel+'/chatters?callback=JSON_CALLBACK')
		.then(function(response) {
			twitch.chat.chatters = response.data.data.chatter_count;
			twitch.chat.mods = response.data.data.chatters.moderators;
			twitch.chat.viewers = response.data.data.chatters.viewers;
		});
	}
});

app.factory('extraLife', function ($http, $q, $location, $timeout, $sce) {
	
	var teamId = $location.search().teamId || TEAM_ID;
	var donationDuration = $location.search().alert || DONATION_DURATION;
	var lastDonation = null;
	var donationQueue = [];
	var showingDonation = false;
	var twitchChannel = $location.search().twitch || TWITCH_CHANNEL;

	var extraLife = {
		
		team: null,
		roster: null,
		donations: null,
		donation: null,
		
		refresh: function() {
			var promise;
			if (!extraLife.team) {
				promise = $q.all([updateTeam(), updateRoster()]).then(updateDonations);
			} else {
				promise = $q.all([updateTeam(), updateDonations()]);				
			}
			return promise.then(checkForNewDonations);
		},
		
		simulateDonation: function(amount, donor, donee, message) {
			extraLife.donations.unshift({
				donationAmount: amount,
				donorName: donor,
				participant: donee,
				message: message,
				createdOn: moment().add(1, 'hours').format('YYYY-MM-DD HH:mm:ss')
			});
			checkForNewDonations();
		}
				
	};
	
	function processQueue() {
		if (showingDonation) return;
		if (!donationQueue.length) return;
		
		extraLife.donation = donationQueue.shift();
		(new Audio('chime-ding.wav')).play();
		showingDonation = true;
		
		$timeout(function(){
			extraLife.donation = null;
			$timeout(function(){
				showingDonation = false;
				processQueue();
			}, 500);
		}, donationDuration * 1000);
	}
	
	function checkForNewDonations() {
		if (!lastDonation) {
			lastDonation = extraLife.donations[0];
		} else {
			var newDonations = _.chain(extraLife.donations)
				.filter(function(d){ return d.createdOn > lastDonation.createdOn;})
				.sortBy(function(d){ return d.createdOn; })
				.value();
			angular.forEach(newDonations, function(d) {
				donationQueue.push(d);
			});
			lastDonation = extraLife.donations[0];
			processQueue();
		}
	}
	
	function updateTeam() {
		return $http.get('https://www.extra-life.org/index.cfm?fuseaction=donordrive.team&teamID='+teamId+'&format=json').then(function(response) {
			response.data.goalPercent = Math.min(Math.max(response.data.totalRaisedAmount * 100 / response.data.fundraisingGoal, 0), 100);
			extraLife.team = response.data;
		});
	}
	
	function updateRoster() {
		return $http.get('https://www.extra-life.org/index.cfm?fuseaction=donordrive.teamParticipants&teamID='+teamId+'&format=json').then(function(response){
			extraLife.roster = response.data;
		});
	}

	function getParticipantDonations(participant) {
		return $http.get('https://www.extra-life.org/index.cfm?fuseaction=donorDrive.participantDonations&participantID='+participant.participantID+'&format=json').then(function(response){
			angular.forEach(response.data, function(d){
				d.createdOn = moment(d.createdOn).format('YYYY-MM-DD HH:mm:ss');
				d.participant = participant.displayName;
			});
			return response.data;
		});		
	}
	
	function updateDonations() {
		return $q.all(extraLife.roster.map(function(participant){
			return getParticipantDonations(participant);
		})).then(function(dons){
			extraLife.donations = _.chain(dons)
				.flatten()
				.filter(function(d){ return d.donationAmount !== null })
				.sortBy('createdOn')
				.reverse()
				.value();
		});		
	}

	return extraLife;
});

app.filter('currency', ['$filter', function ($filter) {
	return function(input) {
		return numeral(input).format('$0,0[.]00');  
	};
}]);

app.filter('time', ['$filter', function ($filter) {
	return function(input) {
		return moment(input).format('LT');  
	};
}]);

app.filter('date', ['$filter', function ($filter) {
	return function(input) {
		return moment(input).format('MMM D');  
	};
}]);
