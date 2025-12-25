export default {
    logo: <span>Fiinny Engineering Wiki</span>,
    project: {
        link: 'https://github.com/fiinny/lifemap', // Placeholder
    },
    docsRepositoryBase: 'https://github.com/fiinny/lifemap/blob/main/wiki', // Placeholder
    footer: {
        text: '© 2025 Fiinny Internal Engineering',
    },
    useNextSeoProps() {
        return {
            titleTemplate: '%s – Fiinny Wiki'
        }
    },
    head: (
        <>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5891610127665684" crossOrigin="anonymous"></script>
        </>
    ),
    sidebar: {
        defaultMenuCollapseLevel: 1,
        toggleButton: true,
    },
    primaryHue: 190, // Teal-ish to match Fiinny brand
}
