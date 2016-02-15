var _ = require('underscore');
var async = require('async');

var Prometheus = require("prometheus-client");
var pm2 = require('pm2');
var express = require('express');
var argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -p 9010', 'Use port 9010')
    .alias('p', 'port')
    .alias('h', 'help')
    .default('p', 9116)
    .describe('p', 'Server port')
    .help('h')
    .argv;

var serverPort = argv.p;

var prometheus = new Prometheus();

var stats_error = prometheus.newGauge({
    namespace: "pm2",
    name: "stats_error",
    help: "Error during stats"
});

var up = prometheus.newGauge({
    namespace: "pm2",
    name: "up",
    help: "Process is up"
});

var uptime = prometheus.newGauge({
    namespace: "pm2",
    name: "uptime",
    help: "Process uptime"
});

var instances = prometheus.newGauge({
    namespace: "pm2",
    name: "instances",
    help: "Process instances"
});

var restarts = prometheus.newGauge({
    namespace: "pm2",
    name: "restarts",
    help: "Process restarts"
});

var memory = prometheus.newGauge({
    namespace: "pm2",
    name: "memory",
    help: "Process memory"
});

var cpu = prometheus.newGauge({
    namespace: "pm2",
    name: "cpu",
    help: "Process cpu"
});


function update(req, res, updateCallback) {

    console.log('Getting stats...');

    stats_error.set({}, 0);

    var onError = function(err){

        console.error(err);
        stats_error.set({}, 1);

        pm2.disconnect();
        updateCallback();
    };

    pm2.connect(function (err){

        if (err) {

            onError(err);
            return;
        }

        pm2.list(function (listError, list) {

            if (listError) {

                onError(listError);
                return;
            }

            _.each(list, function(item){

                var processObj = {
                    name: item.name
                };

                up.set(processObj, item.pm2_env.status == 'online' ? 1 : 0);
                uptime.set(processObj, new Date().getTime() - item.pm2_env.pm_uptime);
                instances.set(processObj, item.pm2_env.instances);
                restarts.set(processObj, item.pm2_env.unstable_restarts);
                memory.set(processObj, item.monit.memory);
                cpu.set(processObj, item.monit.cpu);
            });

            console.log('Stats done');

            pm2.disconnect();
            updateCallback();
        });
    });
}

// START
var app = express();
app.get("/metrics", update, prometheus.metricsFunc());

app.listen(serverPort, function() {
    console.log('Server listening at port ' + serverPort + '...');
});
app.on("error", function(err) {
    return console.error("Metric server error: " + err);
});