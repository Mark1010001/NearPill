async function loadPolicies() {
  const status = document.getElementById('policyStatus');
  try {
    const response = await fetch('policies.json');
    if (!response.ok) throw new Error('Policy information unavailable');
    const policies = await response.json();
    status.textContent = `${policies.status} Updated ${policies.updated}.`;
    for (const policy of policies.sections) {
      const link = document.createElement('a');
      link.href = `#${policy.id}`;
      link.textContent = policy.title;
      document.getElementById('policyNav').appendChild(link);
      const section = document.createElement('section');
      section.id = policy.id;
      const heading = document.createElement('h2');
      heading.textContent = policy.title;
      const body = document.createElement('p');
      body.textContent = policy.body;
      section.append(heading, body);
      document.getElementById('policySections').appendChild(section);
    }
  } catch (_) {
    status.textContent = 'Service information could not be loaded. Please reload or email nearpillemail@gmail.com for a copy.';
  }
}

loadPolicies();
