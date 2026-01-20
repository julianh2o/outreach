/**
 * Simple test script for BAML/Ollama integration
 * Run with: npx tsx server/tests/baml-test.ts
 */

import { b } from '../../baml_client/baml_client';

async function testBaml() {
  console.log('Testing BAML/Ollama integration...\n');

  // Check environment variables
  console.log('Environment:');
  console.log(`  LLM_ENDPOINT: ${process.env.LLM_ENDPOINT || '(not set)'}`);
  console.log(`  LLM_MODEL: ${process.env.LLM_MODEL || '(not set)'}`);
  console.log('');

  const testInput = {
    conversationSnippet: `[Jan 15, 10:00 AM] John: Hey, I'm planning a trip to Tokyo next week!
[Jan 15, 10:05 AM] John: I'll be there from Jan 22-28
[Jan 15, 10:10 AM] John: Super excited, it's my first time visiting Japan`,
    contactName: 'John Smith',
    currentDate: '2026-01-20',
    availableFields: `- travel_plans: Travel Plans
- hobbies: Hobbies`,
    availableTags: 'traveler, friend, family, coworker, vip',
    currentValues: JSON.stringify({
      birthday: null,
      notes: null,
    }),
  };

  console.log('Test Input:');
  console.log(JSON.stringify(testInput, null, 2));
  console.log('\n---\n');

  try {
    console.log('Calling ExtractContactInfo...');
    const result = await b.ExtractContactInfo(testInput);

    console.log('\nSuccess! Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\nError:', error);

    // Try to diagnose the issue
    if (error instanceof Error && error.message.includes('404')) {
      console.log('\n--- Diagnosis ---');
      console.log('A 404 error suggests the Ollama model may not be available.');
      console.log('Check that:');
      console.log('  1. Ollama is running (ollama serve)');
      console.log('  2. The model is pulled (ollama pull llama3)');
      console.log('  3. LLM_ENDPOINT is correct (default: http://localhost:11434)');
    }
  }
}

// Load dotenv and run
import 'dotenv/config';
testBaml();
