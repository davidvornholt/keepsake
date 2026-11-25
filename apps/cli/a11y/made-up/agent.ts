#!/usr/bin/env bun
// Stands in for the program that starts an agent: it starts none, and says
// where one could be read along.
import process from 'node:process';

const [, , shoot = ''] = process.argv;
process.stdout.write(
  JSON.stringify({ link: `https://agents.example.com/threads/${shoot}` }),
);
